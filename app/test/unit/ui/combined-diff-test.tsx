import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { SelectedCommits } from '../../../src/ui/history/selected-commits'
import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'
import { Repository } from '../../../src/models/repository'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { ImageDiffType } from '../../../src/models/diff'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function setup() {
  const identity = new CommitIdentity('User', 'user@example.com', new Date())
  const commits = ['new', 'middle', 'old'].map(
    sha => new Commit(sha, sha, sha, '', identity, identity, [], [], [])
  )
  const selections: { shas: ReadonlyArray<string>; contiguous: boolean }[] = []
  let loads = 0
  const props: React.ComponentProps<typeof SelectedCommits> = {
    repository: new Repository('/repo', 1, null, false),
    dispatcher: {
      changeCommitSelection: (
        _repo: Repository,
        shas: ReadonlyArray<string>,
        contiguous: boolean
      ) => selections.push({ shas, contiguous }),
      loadChangedFilesForCurrentSelection: () => loads++,
    } as unknown as Dispatcher,
    emoji: new Map(),
    selectedCommits: [commits[0], commits[2]],
    shasInDiff: ['new', 'old'],
    historyShas: ['new', 'middle', 'old'],
    isSearching: false,
    isContiguous: false,
    localCommitSHAs: [],
    changesetData: { files: [], linesAdded: 0, linesDeleted: 0 },
    selectedFile: null,
    currentDiff: null,
    commitSummaryWidth: { value: 300, min: 200, max: 500 },
    selectedDiffType: ImageDiffType.TwoUp,
    onOpenInExternalEditor: () => {},
    onViewCommitOnGitHub: () => {},
    hideWhitespaceInDiff: false,
    showSideBySideDiff: false,
    onOpenBinaryFile: () => {},
    onOpenSubmodule: () => {},
    onChangeImageDiffType: () => {},
    onDiffOptionsOpened: () => {},
    showDragOverlay: false,
    accounts: [],
  }
  return { props, commits, selections, getLoads: () => loads }
}

describe('combined diff review', () => {
  it('expands the range, loads the diff, and restores the original selection', () => {
    const { props, commits, selections, getLoads } = setup()
    const view = render(<SelectedCommits {...props} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'View combined diff of 3 commits' })
    )
    assert.deepEqual(selections, [
      { shas: ['new', 'middle', 'old'], contiguous: true },
    ])
    assert.equal(getLoads(), 1)
    view.rerender(
      <SelectedCommits
        {...props}
        selectedCommits={commits}
        isContiguous={true}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Return to original selection' })
    )
    assert.deepEqual(selections[1], { shas: ['new', 'old'], contiguous: false })
  })

  it('does not offer a range diff for filtered search results', () => {
    const { props, selections } = setup()
    render(<SelectedCommits {...props} isSearching={true} />)
    assert.equal(
      screen.queryByRole('button', { name: /View combined diff/ }),
      null
    )
    assert.ok(screen.getByText(/Clear the commit search/))
    assert.deepEqual(selections, [])
  })

  it('drops the return action when the user selects another commit', () => {
    const { props, commits } = setup()
    const view = render(<SelectedCommits {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /View combined diff/ }))
    view.rerender(
      <SelectedCommits
        {...props}
        selectedCommits={commits}
        isContiguous={true}
      />
    )
    view.rerender(
      <SelectedCommits
        {...props}
        selectedCommits={[commits[1]]}
        isContiguous={true}
      />
    )
    assert.equal(
      screen.queryByRole('button', { name: 'Return to original selection' }),
      null
    )
  })
})
