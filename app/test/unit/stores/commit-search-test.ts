import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AppStore } from '../../../src/lib/stores/app-store'
import { RepositoryStateCache } from '../../../src/lib/stores/repository-state-cache'
import { Repository } from '../../../src/models/repository'
import { TipState } from '../../../src/models/tip'
import { HistoryTabMode } from '../../../src/lib/app-state'
import { TestStatsStore } from '../../helpers/test-stats-store'

type Batch = { shas: string[]; hasMore: boolean } | null
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

function setup() {
  const repo = new Repository('/repo', 1, null, false)
  const cache = new RepositoryStateCache(new TestStatsStore())
  const requests: {
    query: string
    tip: string
    skip: number
    result: { promise: Promise<Batch>; resolve: (value: Batch) => void }
  }[] = []
  const history = deferred<string[] | null>()
  const gitStore = {
    tip: { kind: TipState.Detached, currentSha: 'pinned-tip' },
    localCommitSHAs: [],
    loadCommitBatch: () => history.promise,
    searchCommitBatch: (tip: string, query: string, skip: number) => {
      const result = deferred<Batch>()
      requests.push({ tip, query, skip, result })
      return result.promise
    },
  }
  // Exercise the production orchestration with controlled Git completion order.
  const store: AppStore = Object.assign(Object.create(AppStore.prototype), {
    repositoryStateCache: cache,
    gitStoreCache: { get: () => gitStore },
    emitUpdate: () => {},
    _changeCommitSelection: () => {},
    updateOrSelectFirstCommit: () => {},
  })
  return { repo, cache, store, requests, history }
}

describe('commit search orchestration', () => {
  it('ignores an older query even when the same text is submitted again', async () => {
    const { repo, cache, store, requests } = setup()
    const first = store._searchHistoryCommits(repo, 'one')
    const second = store._searchHistoryCommits(repo, 'two')
    const third = store._searchHistoryCommits(repo, 'one')
    requests[2].result.resolve({ shas: ['latest'], hasMore: false })
    await third
    requests[0].result.resolve({ shas: ['obsolete'], hasMore: true })
    requests[1].result.resolve({ shas: ['also-obsolete'], hasMore: true })
    await Promise.all([first, second])
    assert.deepEqual(cache.get(repo).compareState.commitSHAs, ['latest'])
    assert.equal(cache.get(repo).compareState.searchLoading, false)
  })

  it('restores normal history and ignores an in-flight search after clearing', async () => {
    const { repo, cache, store, requests, history } = setup()
    const search = store._searchHistoryCommits(repo, 'needle')
    const clear = store._searchHistoryCommits(repo, '')
    requests[0].result.resolve({ shas: ['stale-match'], hasMore: false })
    await search
    history.resolve(['head', 'older'])
    await clear
    assert.equal(cache.get(repo).compareState.searchQuery, undefined)
    assert.deepEqual(cache.get(repo).compareState.commitSHAs, ['head', 'older'])
    assert.equal(
      cache.get(repo).compareState.formState.kind,
      HistoryTabMode.History
    )
  })

  it('loads the next matching batch at the pinned tip and stops at the last batch', async () => {
    const { repo, cache, store, requests } = setup()
    const search = store._searchHistoryCommits(repo, 'needle')
    requests[0].result.resolve({ shas: ['first'], hasMore: true })
    await search
    const next = store._loadNextCommitBatch(repo)
    assert.equal(requests[1].skip, 1)
    assert.equal(requests[1].tip, 'pinned-tip')
    requests[1].result.resolve({ shas: ['second'], hasMore: false })
    await next
    await store._loadNextCommitBatch(repo)
    assert.equal(requests.length, 2)
    assert.deepEqual(cache.get(repo).compareState.commitSHAs, [
      'first',
      'second',
    ])
  })

  it('does not append an old page to a new search', async () => {
    const { repo, cache, store, requests } = setup()
    const search = store._searchHistoryCommits(repo, 'needle')
    requests[0].result.resolve({ shas: ['first'], hasMore: true })
    await search
    const page = store._loadNextCommitBatch(repo)
    const replacement = store._searchHistoryCommits(repo, 'other')
    requests[2].result.resolve({ shas: ['replacement'], hasMore: false })
    await replacement
    requests[1].result.resolve({ shas: ['stale-page'], hasMore: false })
    await page
    assert.deepEqual(cache.get(repo).compareState.commitSHAs, ['replacement'])
  })

  it('does not append a normal history batch to search results', async () => {
    const { repo, cache, store, requests, history } = setup()
    const page = store._loadNextCommitBatch(repo)
    const search = store._searchHistoryCommits(repo, 'needle')
    requests[0].result.resolve({ shas: ['match'], hasMore: false })
    await search
    history.resolve(['unfiltered'])
    await page
    assert.deepEqual(cache.get(repo).compareState.commitSHAs, ['match'])
  })
})
