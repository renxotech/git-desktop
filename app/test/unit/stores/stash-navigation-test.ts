import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AppStore } from '../../../src/lib/stores/app-store'
import { RepositoryStateCache } from '../../../src/lib/stores/repository-state-cache'
import { Repository } from '../../../src/models/repository'
import { Tip, TipState } from '../../../src/models/tip'
import { ChangesSelectionKind } from '../../../src/lib/app-state'
import {
  IStashEntry,
  StashedChangesLoadStates,
} from '../../../src/models/stash-entry'
import { TestStatsStore } from '../../helpers/test-stats-store'
import { createStashMenuItems } from '../../../src/ui/stashing/stash-menu'
import { setupEmptyRepository } from '../../helpers/repositories'
import {
  getStashes,
  createDesktopStashMessage,
} from '../../../src/lib/git/stash'
import { exec } from 'dugite'
import { writeFile } from 'fs/promises'
import { join } from 'path'

function entry(branchName: string, stashSha: string): IStashEntry {
  return {
    branchName,
    stashSha,
    name: 'refs/stash@{0}',
    tree: 'tree',
    parents: [],
    files: { kind: StashedChangesLoadStates.Loaded, files: [] },
  }
}

function setup(repo = new Repository('/repo', 1, null, false)) {
  const statsStore = new TestStatsStore()
  const cache = new RepositoryStateCache(statsStore)
  const own = entry('current', 'own')
  const other = entry('other', 'other-sha')
  const requests: Array<(result: IStashEntry | undefined) => void> = []
  const gitStore = {
    tip: { kind: TipState.Unknown } as Tip,
    currentRemote: null,
    defaultBranch: null,
    upstreamDefaultBranch: null,
    allBranches: [],
    recentBranches: [],
    pullWithRebase: false,
    currentBranchStashEntry: own,
    desktopStashEntries: new Map([
      [own.branchName, own],
      [other.branchName, other],
    ]),
    commitLookup: new Map(),
    localCommitSHAs: [],
    localTags: null,
    aheadBehind: null,
    tagsToPush: null,
    lastFetched: null,
    performFailableOperation: () =>
      new Promise<IStashEntry | undefined>(resolve => requests.push(resolve)),
  }
  cache.updateChangesState(repo, () => ({ stashEntry: own }))
  const store: AppStore = Object.assign(Object.create(AppStore.prototype), {
    repositoryStateCache: cache,
    gitStoreCache: { get: () => gitStore },
    selectedRepository: repo,
    stashPreviewRequests: new Map(),
    statsStore,
    hasUserViewedStash: true,
    emitUpdate: () => {},
    updateMenuLabelsForSelectedRepository: () => {},
    updateChangesStashDiff: () => {},
    updateChangesWorkingDirectoryDiff: () => {},
  })
  return { repo, cache, store, gitStore, own, other, requests }
}

describe('stash navigation', () => {
  it('loads a real stash from another branch without changing HEAD or working files', async t => {
    const repo = await setupEmptyRepository(t)
    const readme = join(repo.path, 'README.md')
    await writeFile(readme, 'base\n')
    for (const args of [
      ['add', 'README.md'],
      ['commit', '-m', 'base'],
      ['checkout', '-b', 'saved'],
    ]) {
      const result = await exec(args, repo.path)
      assert.equal(result.exitCode, 0, result.stderr)
    }
    await writeFile(readme, 'saved changes\n')
    assert.equal(
      (
        await exec(
          ['stash', 'push', '-m', createDesktopStashMessage('saved')],
          repo.path
        )
      ).exitCode,
      0
    )
    assert.equal((await exec(['checkout', 'master'], repo.path)).exitCode, 0)
    const sha = (await getStashes(repo)).desktopEntries[0].stashSha
    const { store, cache, gitStore } = setup(repo)
    cache.updateChangesState(repo, () => ({ stashEntry: null }))
    Object.assign(gitStore, {
      performFailableOperation: (fn: () => Promise<unknown>) => fn(),
      loadStashEntries: async () => {
        gitStore.desktopStashEntries.clear()
        for (const stash of (await getStashes(repo)).desktopEntries) {
          gitStore.desktopStashEntries.set(stash.branchName, stash)
        }
      },
    })
    await store._showStash(repo, sha)
    const preview = cache.get(repo).changesState.previewStashEntry
    assert.equal(preview?.stashSha, sha)
    assert.equal(preview?.files.kind, StashedChangesLoadStates.Loaded)
    assert.equal(
      preview?.files.kind === StashedChangesLoadStates.Loaded &&
        preview.files.files.length,
      1
    )
    assert.equal(cache.get(repo).changesState.stashEntry, null)
    assert.equal(
      (
        await exec(['symbolic-ref', '--short', 'HEAD'], repo.path)
      ).stdout.trim(),
      'master'
    )
    assert.equal((await exec(['status', '--porcelain'], repo.path)).stdout, '')
    assert.equal((await getStashes(repo)).desktopEntries[0].stashSha, sha)
  })

  it('previews another branch without replacing the current branch stash', async () => {
    const { repo, cache, store, own, other, requests } = setup()
    const pending = store._showStash(repo, other.stashSha)
    requests[0](other)
    await pending
    assert.equal(cache.get(repo).changesState.stashEntry, own)
    assert.equal(cache.get(repo).changesState.previewStashEntry, other)
    assert.equal(
      cache.get(repo).changesState.selection.kind,
      ChangesSelectionKind.Stash
    )
  })

  it('preserves the preview across background refreshes', async () => {
    const { repo, cache, store, gitStore, own, other, requests } = setup()
    const pending = store._showStash(repo, other.stashSha)
    requests[0](other)
    await pending
    store['onGitStoreUpdated'](repo, gitStore as never)
    assert.equal(cache.get(repo).changesState.stashEntry, own)
    assert.equal(
      cache.get(repo).changesState.previewStashEntry?.stashSha,
      other.stashSha
    )
    assert.equal(
      cache.get(repo).changesState.selection.kind,
      ChangesSelectionKind.Stash
    )
  })

  it('closes a deleted preview rather than silently displaying the current branch stash', async () => {
    const { repo, cache, store, gitStore, other, requests } = setup()
    const pending = store._showStash(repo, other.stashSha)
    requests[0](other)
    await pending
    gitStore.desktopStashEntries.delete(other.branchName)
    store['onGitStoreUpdated'](repo, gitStore as never)
    assert.equal(cache.get(repo).changesState.previewStashEntry, null)
    assert.equal(
      cache.get(repo).changesState.selection.kind,
      ChangesSelectionKind.WorkingDirectory
    )
  })

  it('ignores older preview loads when a newer choice finishes first', async () => {
    const { repo, cache, store, own, other, requests } = setup()
    const first = store._showStash(repo, other.stashSha)
    const second = store._showStash(repo, own.stashSha)
    requests[1](own)
    await second
    requests[0](other)
    await first
    assert.equal(cache.get(repo).changesState.previewStashEntry, own)
  })

  it('does not reopen a pending preview after returning to working changes', async () => {
    const { repo, cache, store, other, requests } = setup()
    const pending = store._showStash(repo, other.stashSha)
    await store._selectWorkingDirectoryFiles(repo)
    requests[0](other)
    await pending
    assert.equal(cache.get(repo).changesState.previewStashEntry, null)
    assert.equal(
      cache.get(repo).changesState.selection.kind,
      ChangesSelectionKind.WorkingDirectory
    )
  })

  it('does not open a preview after switching repositories', async () => {
    const { repo, cache, store, other, requests } = setup()
    const pending = store._showStash(repo, other.stashSha)
    Object.assign(store, {
      selectedRepository: new Repository('/other', 2, null, false),
    })
    requests[0](other)
    await pending
    assert.equal(cache.get(repo).changesState.previewStashEntry, null)
  })

  it('uses immutable SHAs in menu actions, preserving branch ampersands', () => {
    const chosen: string[] = []
    const stash = entry('feature/A&B', 'immutable-sha')
    const items = createStashMenuItems([stash], sha => chosen.push(sha))
    assert.equal(items[0].label, 'feature/A&&B')
    items[0].action?.()
    assert.deepEqual(chosen, ['immutable-sha'])
    assert.equal(createStashMenuItems([], () => {})[0].enabled, false)
  })
})
