import assert from 'node:assert/strict'
import { describe, it, TestContext } from 'node:test'
import { exec } from 'dugite'
import * as Path from 'path'
import { writeFile, readFile, rename, unlink } from 'fs/promises'
import { setupEmptyRepository } from '../../helpers/repositories'
import { createTempDirectory } from '../../helpers/temp'
import { git } from '../../../src/lib/git/core'
import { Repository } from '../../../src/models/repository'
import {
  saveSandboxRule,
  updateSandboxRules,
} from '../../../src/lib/git/sandbox-rule'
import { ISandboxRule, readSandboxRules } from '../../../src/lib/sandbox-rule'
import { fetch, fastForwardBranches } from '../../../src/lib/git/fetch'
import { getBranchesDifferingFromUpstream } from '../../../src/lib/git/for-each-ref'
import { addWorktree } from '../../../src/lib/git/worktree'

async function run(path: string, ...args: string[]) {
  const result = await exec(args, path)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout.trim()
}
async function fixture(t: TestContext) {
  const source = await setupEmptyRepository(t, 'development')
  await run(source.path, 'commit', '--allow-empty', '-m', 'base')
  const base = await run(source.path, 'rev-parse', 'HEAD')
  const path = await createTempDirectory(t)
  await run(source.path, 'clone', '--', source.path, path)
  const repo = new Repository(path, -1, null, false)
  const rule: ISandboxRule = {
    version: 1,
    branch: 'refs/heads/development',
    worktreePath: path,
    remote: 'origin',
    remoteURL: source.path,
    selector: 'branch',
    sourceBranch: 'development',
  }
  await saveSandboxRule(path, rule.branch, rule)
  await run(source.path, 'commit', '--allow-empty', '-m', 'new source')
  const target = await run(source.path, 'rev-parse', 'HEAD')
  await run(path, 'fetch', 'origin')
  return { source, repo, rule, base, target }
}
const noReleases = async () => []

describe('sandbox fast-forward integration', () => {
  it('retries failed submodule completion and preserves intervening edits and commits', async t => {
    const previousProtocol = process.env.GIT_ALLOW_PROTOCOL
    process.env.GIT_ALLOW_PROTOCOL = 'file'
    t.after(() => {
      if (previousProtocol === undefined) {
        delete process.env.GIT_ALLOW_PROTOCOL
      } else {
        process.env.GIT_ALLOW_PROTOCOL = previousProtocol
      }
    })
    const source = await setupEmptyRepository(t, 'main')
    const module = await setupEmptyRepository(t, 'main')
    await run(module.path, 'commit', '--allow-empty', '-m', 'module base')
    await run(
      source.path,
      'submodule',
      'add',
      module.path,
      'module with spaces'
    )
    await run(source.path, 'commit', '-m', 'add module')
    const path = await createTempDirectory(t)
    await run(source.path, 'clone', '--recurse-submodules', source.path, path)
    const repo = new Repository(path, -1, null, false)
    const rule: ISandboxRule = {
      version: 1,
      branch: 'refs/heads/main',
      worktreePath: path,
      remote: 'origin',
      remoteURL: source.path,
      selector: 'branch',
      sourceBranch: 'main',
    }
    await saveSandboxRule(path, rule.branch, rule)
    await run(module.path, 'commit', '--allow-empty', '-m', 'module update')
    const targetModule = await run(module.path, 'rev-parse', 'HEAD')
    await run(Path.join(source.path, 'module with spaces'), 'fetch', 'origin')
    await run(
      Path.join(source.path, 'module with spaces'),
      'checkout',
      targetModule
    )
    await run(source.path, 'add', 'module with spaces')
    await run(source.path, 'commit', '-m', 'update module')
    const target = await run(source.path, 'rev-parse', 'HEAD')
    const offline = module.path + '-offline'
    await rename(module.path, offline)
    try {
      const result = await updateSandboxRules(repo, noReleases)
      assert.equal(result[0].status, 'failed', result[0].message)
      assert.equal(await run(path, 'rev-parse', 'HEAD'), target)
      assert.ok((await readSandboxRules(path))[0].pendingSubmodules)
    } finally {
      await rename(offline, module.path)
    }
    const checkedModule = Path.join(path, 'module with spaces')
    const oldHead = await run(checkedModule, 'rev-parse', 'HEAD')
    await writeFile(Path.join(checkedModule, 'local.txt'), 'preserve edit')
    assert.equal(
      (await updateSandboxRules(repo, noReleases))[0].status,
      'blocked'
    )
    assert.equal(
      await readFile(Path.join(checkedModule, 'local.txt'), 'utf8'),
      'preserve edit'
    )
    await unlink(Path.join(checkedModule, 'local.txt'))
    await run(checkedModule, 'commit', '--allow-empty', '-m', 'local work')
    const localHead = await run(checkedModule, 'rev-parse', 'HEAD')
    assert.equal(
      (await updateSandboxRules(repo, noReleases))[0].status,
      'blocked'
    )
    assert.equal(await run(checkedModule, 'rev-parse', 'HEAD'), localHead)
    // Restore only this disposable fixture to its recorded pre-update commit.
    await run(checkedModule, 'checkout', oldHead)
    const retry = await updateSandboxRules(repo, noReleases)
    assert.equal(retry[0].status, 'current', retry[0].message)
    assert.equal(await run(checkedModule, 'rev-parse', 'HEAD'), targetModule)
    assert.equal((await readSandboxRules(path))[0].pendingSubmodules, undefined)
  })
  it('routes protected Pull to the user fetch pipeline', async t => {
    const { repo } = await fixture(t)
    const { AppStore } = await import('../../../src/lib/stores/app-store')
    const { FetchType } = await import('../../../src/models/fetch')
    const store = Object.create(AppStore.prototype) as InstanceType<
      typeof AppStore
    >
    const call = t.mock.method(store, '_fetch', async () => {})
    await store._pull(repo)
    assert.equal(call.mock.callCount(), 1)
    assert.deepEqual(call.mock.calls[0].arguments, [
      repo,
      FetchType.UserInitiatedTask,
    ])
  })
  it('does not apply rules added after the fetch source snapshot', async t => {
    const { repo, base } = await fixture(t)
    const result = await updateSandboxRules(repo, noReleases, [])
    assert.equal(result[0].status, 'blocked')
    assert.match(result[0].message, /rule changed during fetch/)
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), base)
  })
  it('creates a protected release sandbox at a captured source SHA without changing the original', async t => {
    const { repo, rule, target, base } = await fixture(t)
    const linked = Path.join(await createTempDirectory(t), 'beta')
    await addWorktree(repo, linked, { createBranch: 'beta', commitish: target })
    await saveSandboxRule(linked, 'refs/heads/beta', {
      ...rule,
      branch: 'refs/heads/beta',
      worktreePath: linked,
    })
    assert.equal(await run(linked, 'rev-parse', 'HEAD'), target)
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), base)
    await assert.rejects(
      git(
        ['commit', '--allow-empty', '-m', 'blocked'],
        linked,
        'protectedNewSandbox'
      ),
      /fast-forward rule/
    )
  })
  it('keeps ruled branches out of generic fast-forwarding and retains wide fetch discovery', async t => {
    const { repo, source, base } = await fixture(t)
    await run(
      repo.path,
      'config',
      'remote.origin.fetch',
      '+refs/heads/development:refs/remotes/origin/development'
    )
    await run(source.path, 'branch', 'new-feature')
    await fetch(repo, { name: 'origin', url: source.path })
    assert.equal(
      await run(repo.path, 'rev-parse', 'origin/new-feature'),
      await run(source.path, 'rev-parse', 'HEAD')
    )
    await run(repo.path, 'checkout', '-b', 'ordinary')
    await fastForwardBranches(
      repo,
      await getBranchesDifferingFromUpstream(repo)
    )
    assert.equal(await run(repo.path, 'rev-parse', 'development'), base)
  })
  it('preserves an ignored file that collides with an incoming tracked file', async t => {
    const { repo, source, base } = await fixture(t)
    await run(
      repo.path,
      'config',
      'core.excludesFile',
      Path.join(repo.path, '.git', 'sandbox-ignore')
    )
    await writeFile(
      Path.join(repo.path, '.git', 'sandbox-ignore'),
      'artifact.txt\n'
    )
    await writeFile(Path.join(repo.path, 'artifact.txt'), 'local build output')
    await writeFile(
      Path.join(source.path, 'artifact.txt'),
      'upstream tracked file'
    )
    await run(source.path, 'add', 'artifact.txt')
    await run(source.path, 'commit', '-m', 'add artifact')
    await run(repo.path, 'fetch', 'origin')
    const result = await updateSandboxRules(repo, noReleases)
    assert.equal(result[0].status, 'blocked')
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), base)
    assert.equal(
      await readFile(Path.join(repo.path, 'artifact.txt'), 'utf8'),
      'local build output'
    )
  })
  it('updates other eligible sandboxes when a locked sandbox is blocked', async t => {
    const { repo, rule, target } = await fixture(t)
    const linked = Path.join(await createTempDirectory(t), 'locked')
    await run(repo.path, 'worktree', 'add', '-b', 'other', linked)
    await saveSandboxRule(linked, 'refs/heads/other', {
      ...rule,
      branch: 'refs/heads/other',
      worktreePath: linked,
    })
    await run(repo.path, 'worktree', 'lock', linked)
    const result = await updateSandboxRules(repo, noReleases)
    assert.equal(result.find(r => r.branch === rule.branch)?.status, 'updated')
    assert.equal(
      result.find(r => r.branch === 'refs/heads/other')?.status,
      'blocked'
    )
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), target)
  })
  it('can follow a semantic-version tag prefix without a release provider', async t => {
    const { source, repo, rule, target } = await fixture(t)
    await run(source.path, 'tag', 'v1.0.0')
    await saveSandboxRule(repo.path, rule.branch, {
      ...rule,
      selector: 'tag',
      sourceBranch: 'v',
    })
    const result = await updateSandboxRules(repo, async () => {
      throw new Error('Provider must not be called')
    })
    assert.equal(result[0].status, 'updated', result[0].message)
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), target)
  })
  it('updates owning worktree exactly, protects commits, and can be disabled', async t => {
    const { repo, rule, target } = await fixture(t)
    await assert.rejects(
      git(
        ['commit', '--allow-empty', '-m', 'blocked'],
        repo.path,
        'protectedCommit'
      ),
      /fast-forward rule/
    )
    await assert.rejects(
      git(
        ['-c', 'user.name=Other', 'commit', '--allow-empty', '-m', 'blocked'],
        repo.path,
        'protectedCommitWithOptions'
      ),
      /fast-forward rule/
    )
    const result = await updateSandboxRules(repo, noReleases)
    assert.equal(result[0].status, 'updated', result[0].message)
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), target)
    assert.equal(
      (await updateSandboxRules(repo, noReleases))[0].status,
      'current'
    )
    await saveSandboxRule(repo.path, rule.branch, null)
    await git(
      ['commit', '--allow-empty', '-m', 'allowed'],
      repo.path,
      'ordinaryCommit'
    )
  })
  it('retains untracked edits and skips dirty sandbox', async t => {
    const { repo, base } = await fixture(t)
    await writeFile(Path.join(repo.path, 'local.txt'), 'preserve me')
    const result = await updateSandboxRules(repo, noReleases)
    assert.equal(result[0].status, 'blocked')
    assert.match(result[0].message, /Local changes/)
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), base)
    assert.equal(
      await readFile(Path.join(repo.path, 'local.txt'), 'utf8'),
      'preserve me'
    )
  })
  it('blocks divergent external commits without resetting them', async t => {
    const { repo } = await fixture(t)
    await run(
      repo.path,
      'commit',
      '--allow-empty',
      '-m',
      'external custom work'
    )
    const head = await run(repo.path, 'rev-parse', 'HEAD')
    const result = await updateSandboxRules(repo, noReleases)
    assert.equal(result[0].status, 'blocked')
    assert.match(result[0].message, /divergent history/)
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), head)
  })
  it('shares rules with linked worktrees and guards deletion from another sandbox', async t => {
    const { repo, rule } = await fixture(t)
    const linked = Path.join(await createTempDirectory(t), 'working')
    await run(repo.path, 'worktree', 'add', '-b', 'working', linked)
    assert.deepEqual(
      await readSandboxRules(linked),
      await readSandboxRules(repo.path)
    )
    await assert.rejects(
      git(['branch', '-D', 'development'], linked, 'protectedDelete'),
      /fast-forward rule/
    )
    await git(
      ['commit', '--allow-empty', '-m', 'working sandbox'],
      linked,
      'workingCommit'
    )
    assert.equal((await readSandboxRules(linked))[0].branch, rule.branch)
  })
  it('does not follow a changed source URL', async t => {
    const { repo } = await fixture(t)
    await run(
      repo.path,
      'remote',
      'set-url',
      'origin',
      'https://example.invalid/other.git'
    )
    const result = await updateSandboxRules(repo, noReleases)
    assert.equal(result[0].status, 'blocked')
    assert.match(result[0].message, /URL changed/)
  })
  it('uses annotated published tags from source and ignores conflicting local tags', async t => {
    const { source, repo, rule, base } = await fixture(t)
    await run(
      source.path,
      'tag',
      '-a',
      'release-1.0.0-beta2',
      '-m',
      'beta',
      base
    )
    await run(source.path, 'tag', '-a', 'release-1.0.0', '-m', 'stable', base)
    await run(repo.path, 'tag', 'release-1.0.0-beta2', 'origin/development')
    await saveSandboxRule(repo.path, rule.branch, { ...rule, selector: 'beta' })
    const releases = async () => [
      { tag_name: 'release-1.0.0-beta2', draft: false, prerelease: true },
      { tag_name: 'release-1.0.0', draft: false, prerelease: false },
    ]
    const result = await updateSandboxRules(repo, releases)
    assert.equal(result[0].status, 'current', result[0].message)
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), base)
    assert.notEqual(
      await run(repo.path, 'rev-parse', 'release-1.0.0-beta2'),
      base
    )
    await run(source.path, 'tag', '-d', 'release-1.0.0-beta2')
    const missing = await updateSandboxRules(repo, releases)
    assert.equal(missing[0].status, 'blocked')
    assert.match(missing[0].message, /changed or disappeared/)
  })
  it('blocks unavailable release metadata instead of following development', async t => {
    const { repo, rule, base } = await fixture(t)
    await saveSandboxRule(repo.path, rule.branch, {
      ...rule,
      selector: 'stable',
    })
    const result = await updateSandboxRules(repo, async () => {
      throw new Error('Pagination failed')
    })
    assert.equal(result[0].status, 'blocked')
    assert.match(result[0].message, /Pagination failed/)
    assert.equal(await run(repo.path, 'rev-parse', 'HEAD'), base)
  })
})
