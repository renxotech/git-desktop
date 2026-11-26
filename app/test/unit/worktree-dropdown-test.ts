import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  shouldShowWorktreeDropdown,
  sortWorktreesByCommitDate,
} from '../../src/lib/worktree-dropdown'
import { WorktreeEntry } from '../../src/models/worktree'

describe('shouldShowWorktreeDropdown', () => {
  for (const count of [0, 1, 2, 3]) {
    for (const isOpen of [false, true]) {
      for (const alwaysShow of [false, true]) {
        it(`handles ${count} worktrees, open=${isOpen}, always show=${alwaysShow}`, () => {
          assert.strictEqual(
            shouldShowWorktreeDropdown(count, isOpen, alwaysShow),
            count > 1 || isOpen || alwaysShow
          )
        })
      }
    }
  }
})

describe('sortWorktreesByCommitDate', () => {
  it('orders branch tips newest first and preserves order for ties and missing dates', () => {
    const worktree = (path: string, branch: string | null): WorktreeEntry => ({
      path,
      branch,
      head: '',
      isDetached: branch === null,
      type: 'linked',
      isLocked: false,
      isPrunable: false,
    })
    const entries = [
      worktree('a-detached', null),
      worktree('b-old', 'refs/heads/old'),
      worktree('c-tied', 'refs/heads/tied'),
      worktree('d-new', 'refs/heads/new'),
      worktree('e-missing', 'refs/heads/missing'),
    ]
    const dates = new Map([
      ['refs/heads/old', 100],
      ['refs/heads/tied', 100],
      ['refs/heads/new', 200],
    ])

    assert.deepEqual(
      sortWorktreesByCommitDate(entries, dates).map(entry => entry.path),
      ['d-new', 'b-old', 'c-tied', 'a-detached', 'e-missing']
    )
    assert.equal(entries[0].path, 'a-detached')
  })
})
