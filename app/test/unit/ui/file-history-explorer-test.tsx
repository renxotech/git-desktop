import assert from 'node:assert/strict'
import { before, beforeEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { Repository } from '../../../src/models/repository'
import { DiffType } from '../../../src/models/diff'
import { RepositoryTabs } from '../../../src/ui/history/repository-tabs'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import type {
  IFileInventory,
  IFileRevision,
  IFileSnapshot,
} from '../../../src/lib/git/file-history'

const inventory: IFileInventory = {
  head: 'head',
  paths: ['a.txt', 'b.txt'],
  dirty: new Set(),
  historyPaths: new Map(),
}
const revision = (sha: string, path: string): IFileRevision => ({
  sha,
  shortSha: sha,
  subject: sha + ' subject',
  body: 'Body preview',
  author: 'Author',
  date: '2026-10-19T12:00:00+05:30',
  committerDate: '2026-10-19T12:00:00+05:30',
  parents: [sha + '-parent'],
  path,
  parentPath: path,
})
const loadInventory = mock.fn(async () => inventory)
const loadRevisions = mock.fn(
  async (_repo: Repository, _head: string | null, path: string) => [
    revision('new', path),
    revision('old', path),
  ]
)
const readCurrent = mock.fn(
  async (): Promise<IFileSnapshot> => ({
    contents: Buffer.from('disk'),
    mode: '100644',
    modified: 1000,
  })
)
const readSnapshot = mock.fn(
  async (
    _repo: Repository,
    endpoint: { revision: string | null; path: string }
  ): Promise<IFileSnapshot> => ({
    contents: Buffer.from(endpoint.revision ?? 'disk'),
    mode: '100644',
  })
)
const snapshotDiff = mock.fn(async () => ({
  kind: DiffType.Text,
  text: '',
  hunks: [],
  maxLineNumber: 0,
  hasHiddenBidiChars: false,
}))
let Explorer: typeof import('../../../src/ui/history/file-history-explorer').FileHistoryExplorer

before(async () => {
  mock.module('../../../src/lib/git/file-history.ts', {
    namedExports: {
      loadFileInventory: loadInventory,
      loadFileRevisions: loadRevisions,
      readCurrentSnapshot: readCurrent,
      readFileSnapshot: readSnapshot,
      buildHistoryTree: (
        paths: string[],
        _collapsed: unknown,
        filter: string
      ) =>
        paths
          .filter(path => path.includes(filter))
          .map(path => ({ path, depth: 0, folder: false })),
    },
  })
  mock.module('../../../src/lib/git/diff.ts', {
    namedExports: { getFileSnapshotDiff: snapshotDiff },
  })
  mock.module('../../../src/ui/diff/index.tsx', {
    namedExports: { Diff: () => <div>Rendered shared diff</div> },
  })
  mock.module('../../../src/ui/resizable/index.ts', {
    namedExports: {
      Resizable: (props: { children: React.ReactNode }) => (
        <div>{props.children}</div>
      ),
    },
  })
  mock.module('../../../src/ui/lib/list/index.ts', {
    namedExports: {
      List: (props: {
        ariaLabel: string
        rowCount: number
        rowRenderer: (index: number) => React.ReactNode
        onRowClick: (index: number, source: unknown) => void
      }) => (
        <div role="region" aria-label={props.ariaLabel}>
          {Array.from({ length: props.rowCount }, (_, index) => (
            <button
              key={index}
              data-testid={`${props.ariaLabel}-${index}`}
              onClick={event =>
                props.onRowClick(index, { kind: 'mouseclick', event })
              }
            >
              {props.rowRenderer(index)}
            </button>
          ))}
        </div>
      ),
    },
  })
  Explorer = (await import('../../../src/ui/history/file-history-explorer'))
    .FileHistoryExplorer
})

beforeEach(() => {
  localStorage.clear()
  for (const fn of [
    loadInventory,
    loadRevisions,
    readCurrent,
    readSnapshot,
    snapshotDiff,
  ]) {
    fn.mock.resetCalls()
  }
  loadInventory.mock.mockImplementation(async () => inventory)
  loadRevisions.mock.mockImplementation(async (_repo, _head, path) => [
    revision('new', path),
    revision('old', path),
  ])
  readCurrent.mock.mockImplementation(async () => ({
    contents: Buffer.from('disk'),
    mode: '100644',
    modified: 1000,
  }))
})

const repo = new Repository('D:/example', 1, null, false)
const mount = () =>
  render(<Explorer repository={repo} initialPath="a.txt" refreshToken={0} />)

describe('FileHistoryExplorer integration', () => {
  it('keeps navigation in the file pane and controls in their own pane headers', async () => {
    const onTabClicked = mock.fn()
    const view = render(
      <Explorer
        repository={repo}
        refreshToken={0}
        navigation={
          <RepositoryTabs
            width="100%"
            selectedIndex={2}
            onTabClicked={onTabClicked}
            changesBadge={null}
          />
        }
      />
    )
    await waitFor(() => assert.ok(screen.getByText('a.txt')))
    const tabs = view.container.querySelector('.repository-tabs')!
    const treePane = screen.getByLabelText('Tracked file tree').parentElement!
    assert.equal(tabs.parentElement, treePane)
    assert.equal(treePane.firstElementChild, tabs)
    assert.equal((tabs as HTMLElement).style.width, '100%')
    const revisionHeader = screen.getByLabelText('Revision controls')
    assert.equal(
      screen.getByLabelText('Preview').closest('header'),
      revisionHeader
    )
    assert.equal(
      revisionHeader.parentElement!.firstElementChild,
      revisionHeader
    )
    const diffHeader = screen.getByLabelText('Comparison controls')
    assert.equal(
      screen.getByLabelText('Side by side').closest('header'),
      diffHeader
    )
    assert.equal(diffHeader.parentElement!.firstElementChild, diffHeader)
    fireEvent.click(screen.getByText('Changes'))
    assert.equal(onTabClicked.mock.calls[0].arguments[0], 0)
  })

  it('compares one row against its actual parent and two rows as exact endpoints', async () => {
    mount()
    await waitFor(() => assert.ok(screen.getByText(/new-parent.*→.*new/)))
    fireEvent.click(screen.getByTestId('File revisions-1'), { ctrlKey: true })
    await waitFor(() => assert.ok(screen.getByText(/old.*→.*new/)))
    assert.equal(readSnapshot.mock.calls.at(-2)?.arguments[1].revision, 'old')
    assert.equal(readSnapshot.mock.calls.at(-1)?.arguments[1].revision, 'new')
    fireEvent.click(screen.getByText('Swap'))
    await waitFor(() => assert.ok(screen.getByText(/new.*→.*old/)))
  })

  it('hides excluded-file comparisons and restores them when the filter clears', async () => {
    mount()
    await waitFor(() => assert.ok(screen.getByText('Rendered shared diff')))
    fireEvent.change(screen.getByLabelText('Filter tracked files'), {
      target: { value: 'b.txt' },
    })
    assert.equal(screen.queryByText('Rendered shared diff'), null)
    assert.ok(screen.getByText('Selected file is excluded by the filter.'))
    fireEvent.change(screen.getByLabelText('Filter tracked files'), {
      target: { value: '' },
    })
    await waitFor(() => assert.ok(screen.getByText('Rendered shared diff')))
  })

  it('preserves committed history when Current cannot be read', async () => {
    loadInventory.mock.mockImplementation(async () => ({
      ...inventory,
      dirty: new Set(['a.txt']),
    }))
    readCurrent.mock.mockImplementation(async () => {
      throw new Error('outside root')
    })
    mount()
    await waitFor(() => assert.ok(screen.getByText('Current')))
    assert.ok(screen.getByText(/Timestamp unavailable/))
    assert.ok(screen.getByText('new subject'))
    fireEvent.click(screen.getByTestId('File revisions-1'))
    await waitFor(() => assert.ok(screen.getByText(/new-parent.*→.*new/)))
  })

  it('discards a late response for the previously selected file', async () => {
    let finishOld!: (revisions: IFileRevision[]) => void
    loadRevisions.mock.mockImplementation(async (_repo, _head, path) =>
      path === 'a.txt'
        ? new Promise(resolve => {
            finishOld = resolve
          })
        : [revision('b-revision', path)]
    )
    mount()
    await waitFor(() => assert.equal(typeof finishOld, 'function'))
    fireEvent.click(screen.getByTestId('Tracked file tree-1'))
    await waitFor(() => assert.ok(screen.getByText('b-revision subject')))
    finishOld([revision('stale-a', 'a.txt')])
    await waitFor(() =>
      assert.equal(screen.queryByText('stale-a subject'), null)
    )
    assert.ok(screen.getByText('b-revision subject'))
  })
})
