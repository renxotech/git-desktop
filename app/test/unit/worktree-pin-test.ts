import assert from 'node:assert'
import { describe, it } from 'node:test'
import { isWorktreePinned, setWorktreePinned } from '../../src/lib/worktree-pin'

describe('worktree pins', () => {
  it('persists pins independently for worktrees with the same folder name', () => {
    const path = 'C:/projects/one/worktree'
    const other = 'C:/projects/two/worktree'
    assert.strictEqual(isWorktreePinned(path), false)
    setWorktreePinned(path, true)
    setWorktreePinned(other, true)
    assert.strictEqual(isWorktreePinned(path), true)
    setWorktreePinned(path, false)
    assert.strictEqual(isWorktreePinned(path), false)
    assert.strictEqual(isWorktreePinned(other), true)
    setWorktreePinned(other, false)
  })

  it('recognizes normalized paths, trailing separators, and Windows casing', () => {
    const path = 'C:/projects/pinned-worktree'
    setWorktreePinned(path, true)
    assert.strictEqual(isWorktreePinned('C:/projects/./pinned-worktree/'), true)
    if (__WIN32__) {
      assert.strictEqual(isWorktreePinned(path.toUpperCase()), true)
    }
    setWorktreePinned(path + '/', false)
    assert.strictEqual(isWorktreePinned(path), false)
  })
})
