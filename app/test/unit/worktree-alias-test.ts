import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  getWorktreeAlias,
  setWorktreeAlias,
} from '../../src/lib/worktree-alias'
import {
  getWorktreeDisplayName,
  WorktreeEntry,
} from '../../src/models/worktree'

describe('worktree aliases', () => {
  it('persists an alias independently for each path and restores the folder name on removal', () => {
    const path = 'C:/projects/worktrees/test'
    const other = 'C:/other/worktrees/test'
    const worktree: WorktreeEntry = {
      path,
      head: 'abc123',
      branch: 'refs/heads/test',
      type: 'linked',
      isDetached: false,
      isLocked: false,
      isPrunable: false,
    }
    setWorktreeAlias(path, '  Friendly name  ')
    assert.strictEqual(getWorktreeAlias(path), 'Friendly name')
    assert.strictEqual(getWorktreeAlias(other), null)
    assert.strictEqual(
      getWorktreeDisplayName({ ...worktree, alias: getWorktreeAlias(path) }),
      'Friendly name'
    )
    assert.strictEqual(worktree.path, path)
    setWorktreeAlias(path, null)
    assert.strictEqual(getWorktreeAlias(path), null)
    assert.strictEqual(getWorktreeDisplayName(worktree), 'test')
  })
  it('uses normalized paths and ignores Windows path casing', () => {
    const path = 'C:/projects/worktrees/alias-normalization'
    setWorktreeAlias(path, 'Alias')
    assert.strictEqual(
      getWorktreeAlias('C:/projects/worktrees/./alias-normalization'),
      'Alias'
    )
    if (__WIN32__) {
      assert.strictEqual(getWorktreeAlias(path.toUpperCase()), 'Alias')
    }
    setWorktreeAlias(path, '  ')
    assert.strictEqual(getWorktreeAlias(path), null)
  })
})
