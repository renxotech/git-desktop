import assert from 'node:assert/strict'
import { it } from 'node:test'
import * as React from 'react'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { git } from '../../../src/lib/git/core'
import { UnmergedBranchesDialog } from '../../../src/ui/branches/unmerged-branches-dialog'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { seed } from '../../helpers/assisted-commit'
import { createTempDirectory } from '../../helpers/temp'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

it('reviews a fresh inventory and resets consent after a failed removal', async t => {
  const repository = await seed(t, { file: 'before\n' })
  const h = await createAssistedCommitRunHarness(t)
  await writeFile(join(repository.path, '.gitignore'), 'dist/\n')
  await git(['add', '.gitignore'], repository.path, 'test')
  await git(['commit', '-m', 'ignore output'], repository.path, 'test')
  const linked = join(await createTempDirectory(t), 'linked')
  await git(
    ['worktree', 'add', '-b', 'finished', linked],
    repository.path,
    'test'
  )
  await mkdir(join(linked, 'dist'))
  await writeFile(join(linked, 'dist', 'bundle.js'), 'original')
  const remove = t.mock.method(
    h.dispatcher,
    'removeMergedWorktreeAndBranch',
    async () => {
      throw new Error(
        'The worktree file inventory changed. Review removal again.'
      )
    }
  )
  const ref = React.createRef<UnmergedBranchesDialog>()
  render(
    <UnmergedBranchesDialog
      ref={ref}
      repository={repository}
      dispatcher={h.dispatcher}
      merged={true}
      allBranches={[]}
      currentBranch={null}
      defaultBranch={null}
      onDismissed={() => {}}
    />
  )
  await waitFor(() => assert.equal(ref.current?.state.busy, null), {
    timeout: 10000,
  })
  fireEvent.click(screen.getByRole('radio', { name: /finished/, hidden: true }))
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Remove worktree and branch…',
      hidden: true,
    })
  )
  await waitFor(() => assert.ok(ref.current?.state.removal), { timeout: 10000 })
  const original = ref.current?.state.removal
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: /Delete these ignored files/,
      hidden: true,
    })
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Remove worktree and branch',
      hidden: true,
    })
  )
  await waitFor(() =>
    assert.ok(
      screen.getByRole('button', { name: 'Review removal again', hidden: true })
    )
  )
  await writeFile(join(linked, 'dist', 'bundle.js'), 'updated output')
  fireEvent.click(
    screen.getByRole('button', { name: 'Review removal again', hidden: true })
  )
  await waitFor(() => assert.equal(ref.current?.state.busy, null), {
    timeout: 10000,
  })
  assert.notDeepEqual(ref.current?.state.removal?.files, original?.files)
  assert.equal(ref.current?.state.includeIgnored, false)
  assert.equal(ref.current?.state.includeSubmodules, false)
  assert.equal(ref.current?.state.error, null)
  assert.equal(remove.mock.callCount(), 1)
  assert.equal(
    screen
      .getByRole('button', { name: 'Remove worktree and branch', hidden: true })
      .getAttribute('aria-disabled'),
    'true'
  )
})
