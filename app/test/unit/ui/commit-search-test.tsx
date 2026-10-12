import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { CompareSidebar } from '../../../src/ui/history/compare'
import { CommitList } from '../../../src/ui/history/commit-list'
import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { Repository } from '../../../src/models/repository'
import { RepositoryStateCache } from '../../../src/lib/stores/repository-state-cache'
import { TestStatsStore } from '../../helpers/test-stats-store'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { AheadBehindStore } from '../../../src/lib/stores/ahead-behind-store'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function makeProps() {
  const repository = new Repository('/repo', 1, null, false)
  const cache = new RepositoryStateCache(new TestStatsStore())
  const calls: string[] = []
  const props: React.ComponentProps<typeof CompareSidebar> = {
    repository,
    isLocalRepository: true,
    compareState: cache.get(repository).compareState,
    emoji: new Map(),
    commitLookup: new Map(),
    localCommitSHAs: [],
    askForConfirmationOnCheckoutCommit: true,
    dispatcher: {
      initializeCompare: () => {},
      updateCompareForm: () => {},
      searchHistoryCommits: (_repo: Repository, query: string) =>
        calls.push(query),
    } as unknown as Dispatcher,
    currentBranch: null,
    selectedCommitShas: [],
    onRevertCommit: () => {},
    onAmendCommit: () => {},
    onViewCommitOnGitHub: () => {},
    onCompareListScrolled: () => {},
    onCherryPick: () => {},
    localTags: null,
    tagsToPush: null,
    aheadBehindStore: {} as AheadBehindStore,
    shasToHighlight: [],
    accounts: [],
    preferAbsoluteDates: false,
  }
  return { props, calls }
}

describe('history commit search', () => {
  it('retains branch comparison and searches on Enter, clearing on Escape', () => {
    const { props, calls } = makeProps()
    render(<CompareSidebar {...props} />)
    assert.ok(screen.getByRole('textbox', { name: 'Branch filter' }))
    const search = screen.getByRole('searchbox', {
      name: 'Search commit messages',
    })
    fireEvent.change(search, { target: { value: 'fix [api]' } })
    assert.deepEqual(calls, [])
    fireEvent.keyDown(search, { key: 'Enter' })
    assert.deepEqual(calls, ['fix [api]'])
    fireEvent.keyDown(search, { key: 'Escape' })
    assert.deepEqual(calls, ['fix [api]', ''])
    assert.equal((search as HTMLInputElement).value, '')
    fireEvent.change(search, { target: { value: 'another' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    assert.deepEqual(calls, ['fix [api]', '', 'another', ''])
  })

  it('shows loading and empty-result feedback and clears state on repository switch', () => {
    const { props } = makeProps()
    const view = render(
      <CompareSidebar
        {...props}
        compareState={{
          ...props.compareState,
          searchQuery: 'needle',
          searchLoading: true,
        }}
      />
    )
    assert.match(screen.getByRole('status').textContent!, /Searching/)
    view.rerender(
      <CompareSidebar
        {...props}
        compareState={{
          ...props.compareState,
          searchQuery: 'needle',
          searchHasMore: false,
        }}
      />
    )
    assert.ok(screen.getByText('No matching commits'))
    assert.equal(screen.getByRole('status').textContent, '0 matching commits')
    view.rerender(
      <CompareSidebar
        {...props}
        repository={new Repository('/other', 2, null, false)}
      />
    )
    assert.equal((screen.getByRole('searchbox') as HTMLInputElement).value, '')
  })

  it('disables position-dependent history edits while results are filtered', () => {
    const { props } = makeProps()
    const sidebar = new CompareSidebar({
      ...props,
      compareState: { ...props.compareState, searchQuery: 'needle' },
    })
    const list = sidebar['renderCommitList']()
    assert.equal(list.props.canUndoCommits, false)
    assert.equal(list.props.canAmendCommits, false)
    assert.equal(list.props.canResetToCommits, false)
    assert.equal(list.props.reorderingEnabled, false)
    assert.equal(list.props.disableSquashing, true)
  })

  it('allows checkout of the first matching row when it is not HEAD', () => {
    const { props } = makeProps()
    const sidebar = new CompareSidebar({
      ...props,
      compareState: {
        ...props.compareState,
        searchQuery: 'needle',
        tip: 'head',
      },
    })
    const list = new CommitList(sidebar['renderCommitList']().props)
    const identity = new CommitIdentity('Test', 'test@example.com', new Date())
    const commit = new Commit(
      'older',
      'older',
      'needle',
      '',
      identity,
      identity,
      [],
      [],
      []
    )
    const menu = list['getContextMenuForSingleCommit'](0, commit)
    const checkout = menu.find(
      item => item.label?.toLowerCase() === 'checkout commit'
    )
    assert.equal(checkout?.enabled, true)
  })
})
