import * as React from 'react'
import { Repository } from '../../models/repository'
import { AppFileStatusKind, CommittedFileChange } from '../../models/status'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Diff } from '../diff'
import { Resizable } from '../resizable'
import { List } from '../lib/list'
import { IFileContents } from '../diff/syntax-highlighting'
import {
  buildHistoryTree,
  IFileEndpoint,
  IFileInventory,
  IFileRevision,
  IFileSnapshot,
  loadFileInventory,
  loadFileRevisions,
  readCurrentSnapshot,
  readFileSnapshot,
} from '../../lib/git/file-history'
import { getFileSnapshotDiff } from '../../lib/git/diff'

interface IProps {
  readonly initialPath?: string
  readonly repository: Repository
  readonly refreshToken: unknown
}
interface IPreferences {
  readonly path: string
  readonly treeCursor?: string
  readonly collapsed: string[]
  readonly treeWidth: number
  readonly historyWidth: number
  readonly preview: boolean
}
interface IState {
  readonly inventory: IFileInventory | null
  readonly path: string
  readonly treeCursor?: string
  readonly filter: string
  readonly collapsed: ReadonlySet<string>
  readonly revisions: ReadonlyArray<IFileRevision>
  readonly current: IFileSnapshot | null
  readonly selection: ReadonlyArray<number>
  readonly limit: number
  readonly preview: boolean
  readonly treeWidth: number
  readonly historyWidth: number
  readonly diff: IDiff | null
  readonly contents: IFileContents | null
  readonly heading: string
  readonly message: string
  readonly busy: boolean
  readonly swapped: boolean
  readonly whitespace: boolean
  readonly sideBySide: boolean
  readonly imageType: ImageDiffType
}
const defaults: IPreferences = {
  path: '',
  collapsed: [],
  treeWidth: 240,
  historyWidth: 290,
  preview: true,
}
function preferenceKey(repository: Repository) {
  return `file-history:${repository.path}`
}
function preferences(repository: Repository): IPreferences {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem(preferenceKey(repository)) ?? '{}'),
    }
  } catch {
    return defaults
  }
}
export class FileHistoryExplorer extends React.Component<IProps, IState> {
  private generation = 0
  private comparison = 0
  private mounted = false
  public constructor(props: IProps) {
    super(props)
    const saved = preferences(props.repository)
    this.state = {
      ...saved,
      path: props.initialPath ?? saved.path,
      collapsed: new Set(saved.collapsed),
      inventory: null,
      filter: '',
      revisions: [],
      current: null,
      selection: [],
      limit: 30,
      diff: null,
      contents: null,
      heading: '',
      message: '',
      busy: true,
      swapped: false,
      whitespace: false,
      sideBySide: false,
      imageType: ImageDiffType.TwoUp,
    }
  }
  public componentDidMount() {
    this.mounted = true
    this.refresh()
    window.addEventListener('focus', this.onFocus)
  }
  public componentWillUnmount() {
    this.mounted = false
    this.generation++
    this.comparison++
    window.removeEventListener('focus', this.onFocus)
  }
  public componentDidUpdate(prevProps: IProps) {
    if (
      prevProps.initialPath !== this.props.initialPath &&
      this.props.initialPath
    ) {
      this.selectFile(this.props.initialPath)
    }
    if (prevProps.refreshToken !== this.props.refreshToken) {
      this.refresh()
    }
    const { path, collapsed, treeWidth, historyWidth, preview } = this.state
    localStorage.setItem(
      preferenceKey(this.props.repository),
      JSON.stringify({
        path,
        collapsed: Array.from(collapsed),
        treeWidth,
        historyWidth,
        preview,
      })
    )
  }
  private onFocus = () => this.refresh()
  private refresh = async () => {
    const generation = ++this.generation
    this.comparison++
    this.setState({ busy: true, diff: null, contents: null })
    try {
      const previousHead = this.state.inventory?.head
      const inventory = await loadFileInventory(this.props.repository)
      if (!this.mounted || generation !== this.generation) {
        return
      }
      this.setState({ inventory, busy: false }, () => {
        if (this.state.path && inventory.paths.includes(this.state.path)) {
          this.selectFile(
            this.state.path,
            this.state.limit,
            previousHead === inventory.head
          )
        } else {
          this.setState({
            path: '',
            revisions: [],
            selection: [],
            current: null,
            message: 'Select a tracked file',
          })
        }
      })
    } catch (error) {
      if (this.mounted && generation === this.generation) {
        this.setState({ busy: false, message: String(error) })
      }
    }
  }
  private selectFile = async (path: string, limit = 30, preserve = false) => {
    const previousSelection = preserve
      ? this.state.selection.map(index => this.endpoint(index).revision)
      : []
    const previousSwap = preserve && this.state.swapped
    const generation = ++this.generation
    this.comparison++
    const inventory = this.state.inventory
    if (!inventory) {
      return
    }
    this.setState({
      path,
      revisions: [],
      current: null,
      selection: [],
      diff: null,
      contents: null,
      busy: true,
      message: '',
      limit,
      swapped: false,
    })
    try {
      const current = inventory.dirty.has(path)
        ? await readCurrentSnapshot(this.props.repository, path).catch(
            () => ({ contents: null, mode: 'unavailable' } as IFileSnapshot)
          )
        : null
      const revisions = await loadFileRevisions(
        this.props.repository,
        inventory.head,
        inventory.historyPaths.get(path) ?? path,
        limit
      )
      if (!this.mounted || generation !== this.generation) {
        return
      }
      this.setState(
        {
          revisions,
          current,
          busy: false,
          selection: preserve
            ? previousSelection
                .map(sha =>
                  sha === null
                    ? current
                      ? 0
                      : -1
                    : (() => {
                        const found = revisions.findIndex(
                          revision => revision.sha === sha
                        )
                        return found < 0 ? -1 : found + (current ? 1 : 0)
                      })()
                )
                .filter(index => index >= 0)
            : revisions.length || current
            ? [0]
            : [],
          swapped: previousSwap,
          message:
            revisions.length || current ? '' : 'No committed history yet',
        },
        this.compare
      )
    } catch (error) {
      if (this.mounted && generation === this.generation) {
        this.setState({ busy: false, message: String(error) })
      }
    }
  }
  private endpoint(index: number): IFileEndpoint {
    if (this.state.current && index === 0) {
      return { revision: null, path: this.state.path }
    }
    const revision = this.state.revisions[index - (this.state.current ? 1 : 0)]
    return { revision: revision.sha, path: revision.path }
  }
  private compare = async () => {
    const id = ++this.comparison
    const { selection, inventory, revisions, path, swapped, whitespace } =
      this.state
    this.setState({ diff: null, contents: null, message: '' })
    if (!inventory || !selection.length) {
      return
    }
    const ordered = [...selection].sort((a, b) => b - a)
    let to = this.endpoint(ordered.at(-1)!)
    let from: IFileEndpoint
    if (ordered.length === 2) {
      from = this.endpoint(ordered[0])
    } else if (to.revision === null) {
      from = {
        revision: inventory.head ?? '',
        path: inventory.historyPaths.get(path) ?? path,
      }
    } else {
      const revision = revisions.find(revision => revision.sha === to.revision)!
      from = { revision: revision.parents[0] ?? '', path: revision.parentPath }
    }
    if (swapped) {
      ;[from, to] = [to, from]
    }
    const snapshot = (endpoint: IFileEndpoint) =>
      endpoint.revision === ''
        ? Promise.resolve({ contents: null, mode: 'absent' } as IFileSnapshot)
        : readFileSnapshot(this.props.repository, endpoint)
    try {
      const [oldFile, newFile] = await Promise.all([
        snapshot(from),
        snapshot(to),
      ])
      if (oldFile.mode === '160000' || newFile.mode === '160000') {
        throw new Error(
          'Submodule boundary: select the submodule as a repository to inspect its contents.'
        )
      }
      const diff = await getFileSnapshotDiff(
        this.props.repository,
        path,
        oldFile.contents,
        newFile.contents,
        whitespace
      )
      if (!this.mounted || id !== this.comparison) {
        return
      }
      const file = new CommittedFileChange(
        path,
        {
          kind:
            oldFile.mode === 'absent'
              ? AppFileStatusKind.New
              : newFile.mode === 'absent'
              ? AppFileStatusKind.Deleted
              : AppFileStatusKind.Modified,
        },
        to.revision ?? 'Current',
        from.revision ?? 'Current'
      )
      const text = (buffer: Buffer | null) =>
        buffer?.toString('utf8').split('\n') ?? []
      const label = (endpoint: IFileEndpoint) =>
        endpoint.revision === null
          ? 'Current'
          : endpoint.revision === ''
          ? 'Absent'
          : endpoint.revision.slice(0, 12)
      const empty =
        oldFile.contents?.equals(newFile.contents ?? Buffer.alloc(0)) &&
        oldFile.mode === newFile.mode
      this.setState({
        diff,
        contents: {
          file,
          oldContents: text(oldFile.contents),
          newContents: text(newFile.contents),
          canBeExpanded: true,
        },
        heading: `${label(from)} → ${label(to)}`,
        message:
          oldFile.mode === '160000' || newFile.mode === '160000'
            ? 'Submodule boundary: commit IDs shown; contents are not traversed.'
            : empty
            ? from.revision === null || to.revision === null
              ? 'Current file matches this revision; staged changes may differ.'
              : 'No differences between these versions.'
            : oldFile.mode !== newFile.mode
            ? `File mode: ${oldFile.mode} → ${newFile.mode}`
            : '',
      })
    } catch (error) {
      if (this.mounted && id === this.comparison) {
        this.setState({ message: String(error) })
      }
    }
  }
  private selectRevision = (index: number, additive: boolean) => {
    const selection = additive
      ? this.state.selection.includes(index)
        ? this.state.selection.filter(row => row !== index)
        : [this.state.selection[0] ?? index, index].filter(
            (row, i, rows) => rows.indexOf(row) === i
          )
      : [index]
    this.setState({ selection, swapped: false }, this.compare)
  }
  // Virtualized row and control callbacks capture this render snapshot.
  /* eslint-disable react/jsx-no-bind */
  public render() {
    const {
      inventory,
      path,
      filter,
      collapsed,
      current,
      revisions,
      preview,
      contents,
      diff,
    } = this.state
    const rows = buildHistoryTree(inventory?.paths ?? [], collapsed, filter)
    const visible = !filter || path.toLowerCase().includes(filter.toLowerCase())
    const toggle = (folder: string) => {
      const next = new Set(collapsed)
      if (next.has(folder)) {
        next.delete(folder)
      } else {
        next.add(folder)
      }
      this.setState({ collapsed: next })
    }
    return (
      <div className="file-history-explorer">
        <Resizable
          width={this.state.treeWidth}
          minimumWidth={180}
          maximumWidth={650}
          description="Tracked files"
          onResize={treeWidth => this.setState({ treeWidth })}
          onReset={() => this.setState({ treeWidth: 240 })}
        >
          <header title={this.props.repository.path}>
            {this.props.repository.path}
            <button onClick={this.refresh}>Refresh</button>
          </header>
          <input
            aria-label="Filter tracked files"
            placeholder="Filter tracked files"
            value={filter}
            onChange={event => {
              this.comparison++
              this.setState(
                {
                  filter: event.currentTarget.value,
                  diff: null,
                  contents: null,
                },
                () => {
                  if (
                    !this.state.filter ||
                    this.state.path
                      .toLowerCase()
                      .includes(this.state.filter.toLowerCase())
                  ) {
                    this.compare()
                  }
                }
              )
            }}
          />
          <List
            rowCount={rows.length}
            rowHeight={28}
            rowId={index => 'history-tree-row-' + index}
            getRowAriaLabel={index =>
              rows[index].path +
              (rows[index].folder
                ? collapsed.has(rows[index].path)
                  ? ' collapsed folder'
                  : ' expanded folder'
                : ' file')
            }
            onSelectedRowChanged={index =>
              this.setState({ treeCursor: rows[index].path })
            }
            selectedRows={
              rows.findIndex(
                row => row.path === (this.state.treeCursor ?? path)
              ) < 0
                ? []
                : [
                    rows.findIndex(
                      row => row.path === (this.state.treeCursor ?? path)
                    ),
                  ]
            }
            selectionMode="single"
            ariaLabel="Tracked file tree"
            rowRenderer={index => {
              const row = rows[index]
              return (
                <span
                  style={{ paddingLeft: row.depth * 16 }}
                  role={row.folder ? 'button' : undefined}
                  aria-expanded={
                    row.folder
                      ? !collapsed.has(row.path) || !!filter
                      : undefined
                  }
                >
                  {row.folder
                    ? collapsed.has(row.path) && !filter
                      ? '▸ '
                      : '▾ '
                    : ''}
                  {row.path.split('/').at(-1)}
                </span>
              )
            }}
            onRowClick={index => {
              const row = rows[index]
              if (row.folder) {
                toggle(row.path)
              } else {
                this.selectFile(row.path)
              }
            }}
            onRowKeyDown={(index, event) => {
              const row = rows[index]
              if (event.key === 'Enter') {
                if (row.folder) {
                  toggle(row.path)
                } else {
                  this.selectFile(row.path)
                }
                event.preventDefault()
              } else if (
                row.folder &&
                ((event.key === 'ArrowRight' && collapsed.has(row.path)) ||
                  (event.key === 'ArrowLeft' && !collapsed.has(row.path)))
              ) {
                toggle(row.path)
                event.preventDefault()
              } else if (
                event.key === 'ArrowLeft' ||
                (row.folder && event.key === 'ArrowRight')
              ) {
                const targetIndex =
                  event.key === 'ArrowRight'
                    ? index + 1
                    : rows.findIndex(
                        candidate =>
                          candidate.path ===
                          row.path.substring(0, row.path.lastIndexOf('/'))
                      )
                if (targetIndex >= 0 && targetIndex < rows.length) {
                  this.setState({ treeCursor: rows[targetIndex].path })
                  document
                    .getElementById('history-tree-row-' + targetIndex)
                    ?.focus()
                }
                event.preventDefault()
              }
            }}
          />
        </Resizable>
        <Resizable
          width={this.state.historyWidth}
          minimumWidth={200}
          maximumWidth={650}
          description="File revisions"
          onResize={historyWidth => this.setState({ historyWidth })}
          onReset={() => this.setState({ historyWidth: 290 })}
        >
          <header>
            {path || 'File revisions'}
            <label>
              <input
                type="checkbox"
                checked={preview}
                onChange={event =>
                  this.setState({ preview: event.currentTarget.checked })
                }
              />
              Preview
            </label>
          </header>
          {visible && (
            <List
              rowCount={revisions.length + (current ? 1 : 0)}
              rowHeight={preview ? 108 : 38}
              selectedRows={[...this.state.selection]}
              selectionMode="single"
              ariaLabel="File revisions"
              onSelectedRowChanged={(index, source) => {
                if (source.kind === 'keyboard') {
                  this.selectRevision(index, false)
                }
              }}
              onRowClick={(index, source) =>
                this.selectRevision(
                  index,
                  source.kind === 'mouseclick' &&
                    (source.event.ctrlKey ||
                      source.event.metaKey ||
                      source.event.shiftKey)
                )
              }
              onRowKeyDown={(index, event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  this.selectRevision(
                    index,
                    event.ctrlKey || event.metaKey || event.shiftKey
                  )
                  event.preventDefault()
                }
              }}
              rowRenderer={index => {
                if (current && index === 0) {
                  return (
                    <div>
                      <strong>Current</strong> ·{' '}
                      {current.modified
                        ? new Date(current.modified).toLocaleString()
                        : 'Timestamp unavailable'}
                      {preview && (
                        <p>
                          Uncommitted changes
                          {current.mode === 'absent' ? ' · Deleted' : ''}
                        </p>
                      )}
                    </div>
                  )
                }
                const revision = revisions[index - (current ? 1 : 0)]
                return (
                  <div>
                    <time>{new Date(revision.date).toLocaleString()}</time> ·{' '}
                    <code>{revision.shortSha}</code>
                    {preview && (
                      <>
                        <strong>{revision.subject}</strong>
                        <span>{revision.author}</span>
                        <p>
                          {revision.body
                            .split('\n')
                            .filter(Boolean)
                            .slice(0, 2)
                            .join(' ')}
                        </p>
                      </>
                    )}
                  </div>
                )
              }}
            />
          )}
          {visible && revisions.length >= this.state.limit && (
            <button
              disabled={this.state.busy}
              onClick={() => this.selectFile(path, this.state.limit + 30, true)}
            >
              Load more revisions
            </button>
          )}
          {visible &&
            this.state.selection.length === 1 &&
            !(current && this.state.selection[0] === 0) && (
              <details>
                <summary>Full commit message</summary>
                <p>{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
                <p>
                  Author date:{' '}
                  {new Date(
                    revisions[this.state.selection[0] - (current ? 1 : 0)]?.date
                  ).toLocaleString()}
                  <br />
                  Committer date:{' '}
                  {new Date(
                    revisions[
                      this.state.selection[0] - (current ? 1 : 0)
                    ]?.committerDate
                  ).toLocaleString()}
                </p>
                <pre>
                  {revisions[this.state.selection[0] - (current ? 1 : 0)]?.sha}
                  {'\n'}
                  {
                    revisions[this.state.selection[0] - (current ? 1 : 0)]
                      ?.subject
                  }
                  {'\n'}
                  {revisions[this.state.selection[0] - (current ? 1 : 0)]?.body}
                </pre>
              </details>
            )}
        </Resizable>
        <section className="file-history-diff" aria-label="File comparison">
          <header>
            {path} · {this.state.heading}
            <button
              onClick={() =>
                this.setState({ swapped: !this.state.swapped }, this.compare)
              }
            >
              Swap
            </button>
            <label>
              <input
                type="checkbox"
                checked={this.state.sideBySide}
                onChange={event =>
                  this.setState({ sideBySide: event.currentTarget.checked })
                }
              />
              Side by side
            </label>
          </header>
          <p role="status">
            {!visible
              ? 'Selected file is excluded by the filter.'
              : this.state.busy
              ? 'Loading file history…'
              : this.state.message}
          </p>
          {visible && diff && contents && (
            <Diff
              repository={this.props.repository}
              file={contents.file}
              diff={diff}
              fileContents={contents}
              readOnly={true}
              imageDiffType={this.state.imageType}
              hideWhitespaceInDiff={this.state.whitespace}
              showSideBySideDiff={this.state.sideBySide}
              showDiffCheckMarks={false}
              onOpenBinaryFile={() => {}}
              onChangeImageDiffType={imageType => this.setState({ imageType })}
              onHideWhitespaceInDiffChanged={whitespace =>
                this.setState({ whitespace }, this.compare)
              }
            />
          )}
        </section>
      </div>
    )
  }
  /* eslint-enable react/jsx-no-bind */
}
