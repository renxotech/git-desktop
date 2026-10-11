// Review evidence: these assertions describe observed defects, not desired behavior.
// Historical 2026-10-01 evidence; expected to fail after the 2026-10-11 repairs.
// Current coverage: app/test/unit/sandbox-rule-regression-test.ts.
// Run: node script/test.mjs docs/reviews/2026-10-01-sandbox-rules-repro.ts
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { exec } from '../../app/node_modules/dugite'
import { rename } from 'fs/promises'
import { setupEmptyRepository } from '../../app/test/helpers/repositories'
import { createTempDirectory } from '../../app/test/helpers/temp'
import { Repository } from '../../app/src/models/repository'
import { GitStore } from '../../app/src/lib/stores/git-store'
import {
  assertSandboxMutationAllowed,
  readSandboxRules,
} from '../../app/src/lib/sandbox-rule'
import {
  saveSandboxRule,
  updateSandboxRules,
} from '../../app/src/lib/git/sandbox-rule'

async function run(path: string, ...args: string[]) {
  const result = await exec(args, path)
  assert.equal(result.exitCode, 0, result.stderr)
  return result.stdout.trim()
}

it('reproduces filename false positive and push-refspec protection gap', async t => {
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
  await assert.rejects(
    assertSandboxMutationAllowed(['add', '--', 'protected'], repo.path),
    /fast-forward rule/
  )
  await assert.doesNotReject(
    assertSandboxMutationAllowed(
      ['push', '--', 'origin', 'protected:protected'],
      repo.path
    )
  )
})

it('reproduces advancement from a stale tracking ref after a real failed fetch', async t => {
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
  const stale = await run(source.path, 'rev-parse', 'HEAD')
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
    assert.equal(results[0].status, 'updated', results[0].message)
    assert.equal(await run(path, 'rev-parse', 'HEAD'), stale)
    assert.notEqual(stale, newest)
  } finally {
    await rename(unavailable, source.path)
  }
})
