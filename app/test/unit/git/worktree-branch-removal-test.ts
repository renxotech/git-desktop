import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { writeFile } from 'fs/promises'
import * as Path from 'path'
import { setupEmptyRepository } from '../../helpers/repositories'
import { createTempDirectory } from '../../helpers/temp'
import { git } from '../../../src/lib/git/core'
import { listWorktrees } from '../../../src/lib/git/worktree'
import {
  checkWorktreeBranchRemoval,
  removeCheckedWorktreeAndBranch,
} from '../../../src/lib/git/worktree-branch-removal'
import { TestContext } from 'node:test'

async function fixture(t: TestContext) {
  const repo = await setupEmptyRepository(t)
  const run = async (...args: string[]) =>
    (await git(args, repo.path, 'worktreeRemovalTest')).stdout.trim()
  await run('commit', '--allow-empty', '-m', 'base')
  const linked = Path.join(await createTempDirectory(t), 'linked')
  await run('worktree', 'add', '-b', 'finished', linked)
  const check = () =>
    checkWorktreeBranchRemoval(repo.path, 'refs/heads/finished', 'HEAD')
  return { repo, run, linked, check }
}

describe('merged worktree and branch removal', () => {
  it('removes a clean merged linked worktree and its branch', async t => {
    const { repo, run, linked, check } = await fixture(t)
    const confirmed = await check()
    assert.equal(confirmed.hasFiles, false)
    assert.deepEqual(confirmed.stashes, [])
    await removeCheckedWorktreeAndBranch(repo.path, confirmed)
    assert(
      !(await listWorktrees(repo.path)).some(
        w => Path.resolve(w.path) === Path.resolve(linked)
      )
    )
    assert.equal(await run('branch', '--list', 'finished'), '')
  })
  it('rechecks new untracked files after confirmation and preserves the branch', async t => {
    const { repo, run, linked, check } = await fixture(t)
    const confirmed = await check()
    await writeFile(Path.join(linked, 'unsaved.txt'), 'keep me')
    assert.equal((await check()).hasFiles, true)
    await assert.rejects(
      removeCheckedWorktreeAndBranch(repo.path, confirmed),
      /files must be handled/
    )
    assert.match(await run('branch', '--list', 'finished'), /finished/)
  })
  it('detects staged and ignored files', async t => {
    const { repo, linked, check } = await fixture(t)
    await writeFile(Path.join(linked, 'staged.txt'), 'keep me')
    await git(['add', 'staged.txt'], linked, 'worktreeRemovalTest')
    assert.equal((await check()).hasFiles, true)
    await git(['reset', '--hard'], linked, 'worktreeRemovalTest')
    await writeFile(Path.join(linked, '.gitignore'), 'ignored.txt\n')
    await git(['add', '.gitignore'], linked, 'worktreeRemovalTest')
    await git(['commit', '-m', 'ignore'], linked, 'worktreeRemovalTest')
    await git(['merge', 'finished'], repo.path, 'worktreeRemovalTest')
    await writeFile(Path.join(linked, 'ignored.txt'), 'keep ignored content')
    assert.equal((await check()).hasFiles, true)
  })
  it('detects repository-wide stashes and never drops them', async t => {
    const { repo, run, linked, check } = await fixture(t)
    const confirmed = await check()
    await writeFile(Path.join(linked, 'stashed.txt'), 'keep stash')
    await git(
      ['stash', 'push', '-u', '-m', 'saved work'],
      linked,
      'worktreeRemovalTest'
    )
    assert.equal((await check()).stashes.length, 1)
    await assert.rejects(
      removeCheckedWorktreeAndBranch(repo.path, confirmed),
      /files must be handled/
    )
    assert.match(await run('stash', 'list'), /saved work/)
  })
  it('rejects current/main and locked worktrees', async t => {
    const { repo, run, linked, check } = await fixture(t)
    await assert.rejects(
      checkWorktreeBranchRemoval(repo.path, 'refs/heads/master', 'HEAD'),
      /main or current/
    )
    await run('worktree', 'lock', linked)
    await assert.rejects(check(), /locked or unavailable/)
  })
  it('rejects changed target tips and branches no longer merged', async t => {
    const { repo, run, linked, check } = await fixture(t)
    const confirmed = await check()
    await run('commit', '--allow-empty', '-m', 'target changed')
    await assert.rejects(
      removeCheckedWorktreeAndBranch(repo.path, confirmed),
      /changed/
    )
    await git(
      ['commit', '--allow-empty', '-m', 'new work'],
      linked,
      'worktreeRemovalTest'
    )
    await assert.rejects(check())
    assert.match(await run('branch', '--list', 'finished'), /finished/)
  })
})
