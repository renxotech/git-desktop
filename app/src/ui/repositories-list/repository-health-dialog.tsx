import * as React from 'react'
import * as Path from 'path'
import { Repository } from '../../models/repository'
import {
  errorMessage,
  inspectHealthRepository,
  IRepositoryHealth,
  IHealthBranch,
  IHealthOperationResult,
  HealthOperation,
} from '../../lib/repository-health'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { Dispatcher } from '../dispatcher'

interface IProps {
  readonly repository: Repository
  readonly repositories: ReadonlyArray<Repository>
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

function upstreamLabel(branch: IHealthBranch | undefined) {
  if (branch === undefined) {
    return 'upstream unavailable'
  }
  if (branch.upstream === null) {
    return 'no upstream'
  }
  const name = branch.upstream.replace(/^refs\/(remotes|heads)\//, '')
  return `${name}${branch.upstreamMissing ? ' (missing)' : ''}`
}

interface IState {
  readonly results: ReadonlyArray<IRepositoryHealth>
  readonly errors: ReadonlyArray<string>
  readonly operations: ReadonlyArray<IHealthOperationResult>
  readonly busy: boolean
  readonly progress: string
}

export class RepositoryHealthDialog extends React.Component<IProps, IState> {
  private controller = new AbortController()
  private mounted = false

  public constructor(props: IProps) {
    super(props)
    this.state = {
      results: [],
      errors: [],
      operations: [],
      busy: false,
      progress: 'Checking repository…',
    }
  }

  public componentDidMount() {
    this.mounted = true
    this.check()
  }

  public componentWillUnmount() {
    this.mounted = false
    this.controller.abort()
  }

  private scan = async () => {
    const signal = this.controller.signal
    const path = this.props.repository.path
    const results: IRepositoryHealth[] = []
    const errors: string[] = []
    if (signal.aborted || !this.mounted) {
      return
    }
    this.setState({ progress: `Checking ${path}` })
    try {
      results.push(await inspectHealthRepository(path))
    } catch (error) {
      errors.push(`${path}: ${errorMessage(error)}`)
    }
    if (this.mounted) {
      this.setState({
        results,
        errors,
        progress: signal.aborted
          ? 'Stopped. Results are incomplete.'
          : `Checked this repository and ${results.reduce(
              (n, r) => n + r.worktrees.length,
              0
            )} worktrees.`,
      })
    }
  }

  private check = async () => {
    if (this.state.busy) {
      return
    }
    this.controller = new AbortController()
    this.setState({
      busy: true,
      results: [],
      errors: [],
      operations: [],
      progress: 'Checking repository…',
    })
    try {
      await this.scan()
    } catch (error) {
      if (this.mounted) {
        this.setState({ errors: [String(error)] })
      }
    } finally {
      if (this.mounted) {
        this.setState({ busy: false })
      }
    }
  }

  private perform = async (operation: HealthOperation) => {
    const selected = this.state.results
    if (this.state.busy || selected.length === 0) {
      return
    }
    this.controller = new AbortController()
    this.setState({
      busy: true,
      operations: [],
      progress:
        operation === 'fetch'
          ? 'Fetching all remotes…'
          : 'Fetching and safely updating worktrees…',
    })
    try {
      await this.props.dispatcher.performRepositoryHealthOperation(
        selected,
        operation,
        this.controller.signal,
        result => {
          if (this.mounted) {
            this.setState(s => ({
              operations: [...s.operations, result],
              progress: `Finished ${result.path}`,
            }))
          }
        }
      )
      if (!this.controller.signal.aborted) {
        await this.scan()
      } else if (this.mounted) {
        this.setState({
          progress: 'Stopped. Check again to refresh this repository’s report.',
        })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState(s => ({ errors: [...s.errors, String(error)] }))
      }
    } finally {
      if (this.mounted) {
        this.setState({ busy: false })
      }
    }
  }

  private open = async (path: string) => {
    try {
      const existing = this.props.repositories.find(r => r.path === path)
      const repository =
        existing ?? (await this.props.dispatcher.addRepositories([path]))[0]
      if (repository) {
        this.props.onDismissed()
        await this.props.dispatcher.selectRepository(repository)
      }
    } catch (error) {
      if (this.mounted) {
        this.setState(s => ({ errors: [...s.errors, String(error)] }))
      }
    }
  }

  private fetchSelected = () => this.perform('fetch')
  private updateSelected = () => this.perform('update')
  private stop = () => {
    this.controller.abort()
    this.setState({
      progress: 'Stopping after in-flight Git operations finish…',
    })
  }

  private onOpenWorktree = (event: React.MouseEvent<HTMLButtonElement>) => {
    const path =
      event.currentTarget.closest<HTMLElement>('[data-health-path]')?.dataset
        .healthPath
    if (path) {
      this.open(path)
    }
  }

  private renderRepository = (result: IRepositoryHealth) => (
    <article className="health-repository" key={result.commonDirectory}>
      <div className="health-repository-heading">
        <strong>{Path.basename(result.path)}</strong>
        <span>{result.unpublished} unpublished commits</span>
      </div>
      <div className="health-path">{result.path}</div>
      {result.remotes.length === 0 && (
        <p>No configured remotes — repository is unpublished.</p>
      )}
      {result.errors.map((error, i) => (
        <p className="health-error" key={i}>
          {error}
        </p>
      ))}
      {result.worktrees.map(worktree => (
        <details
          className="health-worktree"
          key={worktree.path}
          open={
            worktree.files.length > 0 ||
            worktree.unpublished > 0 ||
            !!worktree.error
          }
        >
          <summary>
            {worktree.branch ?? 'Detached HEAD'}
            {worktree.branch !== null &&
              ` → ${upstreamLabel(
                result.branches.find(branch => branch.name === worktree.branch)
              )}`}
            {' · '}
            {worktree.files.length} uncommitted files · {worktree.unpublished}{' '}
            unpublished commits
          </summary>
          <div
            className="health-worktree-content"
            data-health-path={worktree.path}
          >
            <div className="health-path">{worktree.path}</div>
            {worktree.error && <p className="health-error">{worktree.error}</p>}
            {worktree.files.length > 0 && (
              <pre>{worktree.files.join('\n')}</pre>
            )}
            <Button
              disabled={this.state.busy || !!worktree.error}
              onClick={this.onOpenWorktree}
            >
              Open in Desktop
            </Button>
          </div>
        </details>
      ))}
      <details
        open={result.branches.some(
          b =>
            b.unpublished > 0 ||
            b.ahead > 0 ||
            b.behind > 0 ||
            b.upstreamMissing ||
            b.upstream === null
        )}
      >
        <summary>All local branches ({result.branches.length})</summary>
        <ul className="health-branches">
          {result.branches.map(branch => (
            <li key={branch.name}>
              <strong>{branch.name}</strong> → {upstreamLabel(branch)}:{' '}
              {branch.unpublished} unpublished commits
              {branch.upstream !== null &&
                !branch.upstreamMissing &&
                ` · ${branch.ahead} ahead, ${branch.behind} behind`}
            </li>
          ))}
        </ul>
      </details>
    </article>
  )

  public render() {
    const { busy } = this.state
    const visible = this.state.results
    const selectedCount = visible.length
    return (
      <Dialog
        id="repository-health"
        title="Repository health"
        onDismissed={this.props.onDismissed}
        dismissDisabled={busy}
      >
        <DialogContent>
          <p className="health-path">{this.props.repository.path}</p>
          <Button disabled={busy} onClick={this.check}>
            Check repository
          </Button>
          <p className="health-description">
            This repository and its registered worktrees only. Publication
            checks use cached remote refs; fetch to refresh them.
          </p>
          <p role="status">{this.state.progress}</p>
          {this.state.errors.map((error, i) => (
            <p className="health-error" key={i}>
              {error}
            </p>
          ))}
          {this.state.operations.length > 0 && (
            <details className="health-operation-results" open={true}>
              <summary>
                Operation results ({this.state.operations.length})
              </summary>
              {this.state.operations.map(result => (
                <div key={result.path}>
                  <strong className="health-path">{result.path}</strong>
                  {result.messages.map((message, i) => (
                    <div key={i}>{message}</div>
                  ))}
                  {result.errors.map((error, i) => (
                    <div className="health-error" key={i}>
                      {error}
                    </div>
                  ))}
                </div>
              ))}
            </details>
          )}
          {!busy && visible.length === 0 && (
            <p>
              {this.state.results.length > 0
                ? 'No issues found.'
                : 'No repository results available.'}
            </p>
          )}
          <div className="health-results">
            {visible.map(this.renderRepository)}
          </div>
        </DialogContent>
        <DialogFooter>
          {busy ? (
            <Button onClick={this.stop}>Stop</Button>
          ) : (
            <>
              <Button
                disabled={selectedCount === 0}
                onClick={this.fetchSelected}
              >
                Fetch all remotes
              </Button>
              <Button
                disabled={selectedCount === 0}
                onClick={this.updateSelected}
                tooltip="Fetch all remotes, then fast-forward clean worktrees with an available upstream. Dirty, detached, diverged, and locked worktrees are skipped."
              >
                Safely update worktrees
              </Button>
              <Button onClick={this.props.onDismissed}>Close</Button>
            </>
          )}
        </DialogFooter>
      </Dialog>
    )
  }
}
