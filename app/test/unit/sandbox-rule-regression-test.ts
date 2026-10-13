// Regression coverage for the independently reviewed sandbox defects.
// Uses only disposable local repositories; no push is executed.
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { exec } from 'dugite'
import { rename } from 'fs/promises'
import { setupEmptyRepository } from '../helpers/repositories'
import { createTempDirectory } from '../helpers/temp'
import { Repository } from '../../src/models/repository'
import { GitStore } from '../../src/lib/stores/git-store'
import {
  assertSandboxMutationAllowed,
  readSandboxRules,
} from '../../src/lib/sandbox-rule'
import {
  saveSandboxRule,
  updateSandboxRules,
} from '../../src/lib/git/sandbox-rule'

async function run(path: string, ...args: string[]) {
  const result = await exec(args, path)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout.trim()
}

it('allows filenames and rejects protected push refspecs', async t => {
  const repo = await setupEmptyRepository(t, 'protected')
  await run(repo.path, 'commit', '--allow-empty', '-m', 'base')
  await saveSandboxRule(repo.path, 'refs/heads/protected', {
    version: 1,
    branch: 'refs/heads/protected',
    worktreePath: repo.path,
    remote: 'origin',
    remoteURL: repo.path,
    selector: 'branch',
    sourceBranch: 'main',
  })
  await run(repo.path, 'checkout', '-b', 'working')
  await assert.doesNotReject(
    assertSandboxMutationAllowed(['commit', '-m', 'protected'], repo.path)
  )
  await assert.doesNotReject(
    assertSandboxMutationAllowed(
      ['push', '--', 'protected', 'working:working'],
      repo.path
    )
  )
  for (const refspec of [
    '+working:refs/heads/protected',
    ':protected',
    'refs/heads/working*:refs/heads/protected*',
  ]) {
    await assert.doesNotReject(
      assertSandboxMutationAllowed(['push', '--', 'origin', refspec], repo.path)
    )
  }
  for (const refspec of [
    'protected:working',
    '+refs/heads/protected:working',
    'refs/heads/prot*:refs/heads/other*',
  ]) {
    await assert.rejects(
      assertSandboxMutationAllowed(
        ['push', '--', 'origin', refspec],
        repo.path
      ),
      /fast-forward rule/
    )
  }
  await assert.doesNotReject(
    assertSandboxMutationAllowed(['add', '--', 'protected'], repo.path)
  )
  await assert.doesNotReject(
    assertSandboxMutationAllowed(
      ['push', '--delete', 'origin', 'protected'],
      repo.path
    )
  )
  for (const flag of ['--all', '--mirror']) {
    await assert.rejects(
      assertSandboxMutationAllowed(['push', flag, 'origin'], repo.path),
      /fast-forward rule/
    )
  }
  await assert.rejects(
    assertSandboxMutationAllowed(
      ['push', '--', 'origin', 'protected:protected'],
      repo.path
    ),
    /fast-forward rule/
  )
})

it('blocks stale-source advancement after a real failed fetch', async t => {
  const source = await setupEmptyRepository(t, 'development')
  await run(source.path, 'commit', '--allow-empty', '-m', 'base')
  const path = await createTempDirectory(t)
  await run(source.path, 'clone', '--', source.path, path)
  const repo = new Repository(path, -1, null, false)
  await saveSandboxRule(path, 'refs/heads/development', {
    version: 1,
    branch: 'refs/heads/development',
    worktreePath: path,
    remote: 'origin',
    remoteURL: source.path,
    selector: 'branch',
    sourceBranch: 'development',
  })
  await run(source.path, 'commit', '--allow-empty', '-m', 'previously fetched')
  const base = await run(path, 'rev-parse', 'HEAD')
  await run(path, 'fetch', 'origin')
  await run(source.path, 'commit', '--allow-empty', '-m', 'never fetched')
  const newest = await run(source.path, 'rev-parse', 'HEAD')
  const unavailable = source.path + '-offline'
  await rename(source.path, unavailable)
  try {
    const store = Object.create(GitStore.prototype)
    store.repository = repo
    const errors: unknown[] = []
    store.emitError = (error: unknown) => errors.push(error)
    await store.fetchRemotes([{ name: 'origin', url: source.path }], false)
    assert.equal(
      errors.length,
      1,
      'fetch failure was emitted but did not reject'
    )
    const results = await updateSandboxRules(
      repo,
      async () => [],
      await readSandboxRules(path)
    )
    assert.equal(results[0].status, 'blocked', results[0].message)
    assert.equal(await run(path, 'rev-parse', 'HEAD'), base)
    assert.notEqual(base, newest)
  } finally {
    await rename(unavailable, source.path)
  }
})
