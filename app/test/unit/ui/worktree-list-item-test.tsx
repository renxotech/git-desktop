import assert from 'node:assert/strict'
import { it } from 'node:test'
import * as React from 'react'
import { render, screen } from '../../helpers/ui/render'
import { WorktreeListItem } from '../../../src/ui/worktrees/worktree-list-item'

it('identifies the main checkout after it is pinned', () => {
  render(
    <WorktreeListItem
      worktree={{
        path: 'D:/repo',
        branch: 'refs/heads/main',
        head: '1234567890',
        type: 'main',
        isPinned: true,
        isDetached: false,
        isLocked: false,
        isPrunable: false,
      }}
      isCurrentWorktree={true}
      matches={{ title: [], subtitle: [] }}
    />
  )
  assert.ok(screen.getByText('Main · main'))
})
