import assert from 'node:assert/strict'
import { it } from 'node:test'
import { ipcRenderer } from 'electron'
import { updateMenuState, IMenuItemState } from '../../src/lib/menu-update'
import { IAppState, SelectionType } from '../../src/lib/app-state'
import { Repository } from '../../src/models/repository'
import { Branch, BranchType } from '../../src/models/branch'
import { TipState } from '../../src/models/tip'
import { AppMenu } from '../../src/models/app-menu'

it('updates the sandbox Pull label even when enabledness is unchanged, and restores it on branch switch', t => {
  const previousSend = ipcRenderer.send
  const send = t.mock.fn((..._args: Parameters<typeof ipcRenderer.send>) => {})
  ipcRenderer.send = send
  t.after(() => {
    ipcRenderer.send = previousSend
  })
  const repository = new Repository('D:/repo', 1, null, false)
  const branch = new Branch(
    'main',
    'origin/main',
    { sha: 'abc' },
    BranchType.Local,
    'refs/heads/main'
  )
  const repositoryState = {
    branchesState: {
      tip: { kind: TipState.Valid, branch },
      defaultBranch: branch,
    },
    changesState: {
      stashEntry: null,
      conflictState: null,
      workingDirectory: { files: [] },
    },
    worktrees: [{ sandboxRule: { branch: branch.ref } }],
    isPushPullFetchInProgress: false,
    remote: null,
  }
  const state = {
    selectedState: {
      type: SelectionType.Repository,
      repository,
      state: repositoryState,
    },
    repositories: [repository],
    windowState: 'normal',
    showWelcomeFlow: false,
    currentPopup: null,
    resizablePaneActive: false,
  } as unknown as IAppState
  const currentMenu = {
    getItemById: (id: string) =>
      id === 'pull'
        ? { type: 'menuItem', label: 'Pull', enabled: true }
        : undefined,
  } as unknown as AppMenu
  updateMenuState(state, currentMenu)
  const updates = send.mock.calls[0].arguments[1] as Array<{
    id: string
    state: IMenuItemState
  }>
  assert.equal(
    updates.find(item => item.id === 'pull')?.state.label,
    'Fetch and advance sandbox'
  )
  repositoryState.worktrees = []
  updateMenuState(state, null)
  const ordinaryUpdates = send.mock.calls[1].arguments[1] as Array<{
    id: string
    state: IMenuItemState
  }>
  assert.equal(
    ordinaryUpdates.find(item => item.id === 'pull')?.state.label,
    __DARWIN__ ? 'Pull' : 'Pu&ll'
  )
})
