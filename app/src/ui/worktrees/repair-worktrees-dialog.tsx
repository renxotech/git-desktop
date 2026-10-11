import * as React from 'react'
import { Repository } from '../../models/repository'
import { resolveMainWorktreePath } from '../../lib/git/worktree'
import {
  checkWorktreeLinks,
  repairWorktreeLinks,
  IWorktreeLinkCheck,
} from '../../lib/git/worktree-repair'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IProps {
  readonly repository: Repository
  readonly onDismissed: () => void
  readonly onRepaired: (repository: Repository) => Promise<void>
}
interface IState {
  readonly busy: boolean
  readonly checks: ReadonlyArray<IWorktreeLinkCheck>
  readonly error: string | null
  readonly mainPath: string | null
}

export class RepairWorktreesDialog extends React.Component<IProps, IState> {
  public state: IState = { busy: true, checks: [], error: null, mainPath: null }
  private disposed = false
  public componentDidMount() {
    this.check()
  }
  public componentWillUnmount() {
    this.disposed = true
  }
  private check = async () => {
    try {
      const mainPath =
        (await resolveMainWorktreePath(this.props.repository)) ??
        this.props.repository.path
      const checks = await checkWorktreeLinks(mainPath)
      if (!this.disposed) {
        this.setState({ mainPath, checks, busy: false })
      }
    } catch (error) {
      if (!this.disposed) {
        this.setState({ busy: false, error: String(error) })
      }
    }
  }
  private onSubmit = async () => {
    if (this.state.busy || this.state.mainPath === null) {
      return
    }
    this.setState({ busy: true, error: null })
    try {
      const checks = await repairWorktreeLinks(this.state.mainPath)
      await this.props.onRepaired(this.props.repository)
      if (!this.disposed) {
        this.setState({ checks, busy: false })
      }
    } catch (error) {
      if (!this.disposed) {
        this.setState({ busy: false, error: String(error) })
      }
    }
  }
  public render() {
    const { busy, checks, error } = this.state
    const issues = checks.filter(c => c.status !== 'healthy')
    const healthy = checks.filter(c => c.status === 'healthy')
    const repairableCount = issues.filter(c => c.status === 'repairable').length
    const unresolvedCount = issues.length - repairableCount
    return (
      <Dialog
        id="repair-worktrees"
        title="Check and repair worktrees"
        loading={busy}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p>
            Check worktree links after moving or renaming a repository folder.
          </p>
          {error && (
            <div className="worktree-check-error" role="alert">
              <strong>Check or repair could not finish</strong>
              <p>{error}</p>
            </div>
          )}
          {!busy && !error && checks.length === 0 && (
            <p>No linked worktrees found.</p>
          )}
          {!busy && !error && checks.length > 0 && (
            <p className="worktree-check-summary" role="status">
              <strong>
                {issues.length === 0
                  ? 'No issues found.'
                  : `${issues.length} ${
                      issues.length === 1 ? 'issue needs' : 'issues need'
                    } attention.`}
              </strong>{' '}
              {repairableCount > 0 && `${repairableCount} can be repaired. `}
              {unresolvedCount > 0 &&
                `${unresolvedCount} ${
                  unresolvedCount === 1 ? 'requires' : 'require'
                } manual attention. `}
              {healthy.length}{' '}
              {healthy.length === 1 ? 'worktree is' : 'worktrees are'} healthy.
            </p>
          )}
          {issues.length > 0 && (
            <section aria-labelledby="worktree-issues-heading">
              <h3 id="worktree-issues-heading">Issues ({issues.length})</h3>
              <ul className="worktree-check-issues">
                {issues.map(c => (
                  <li key={c.name}>
                    <span className="worktree-issue-label">
                      {c.status === 'repairable'
                        ? 'ISSUE · Repair available'
                        : 'ISSUE · Manual attention required'}
                    </span>
                    <h4>{c.name}</h4>
                    <p>
                      {c.status === 'repairable'
                        ? 'Git’s worktree links are out of date. Use the Repair button below to reconnect this folder.'
                        : 'A unique matching worktree folder could not be found. Locate the folder and check its Git links manually.'}
                    </p>
                    <dl>
                      <dt>Registered folder</dt>
                      <dd>{c.recordedPath}</dd>
                      {c.actualPath && (
                        <>
                          <dt>Located folder</dt>
                          <dd>{c.actualPath}</dd>
                        </>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {healthy.length > 0 && (
            <details className="worktree-check-info">
              <summary>
                Information: {healthy.length} healthy{' '}
                {healthy.length === 1 ? 'worktree' : 'worktrees'} — no action
                needed
              </summary>
              <ul>
                {healthy.map(c => (
                  <li key={c.name}>
                    <strong>{c.name} — Healthy</strong>
                    <p>{c.actualPath ?? c.recordedPath}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              repairableCount > 0
                ? `Repair ${repairableCount} ${
                    repairableCount === 1 ? 'worktree' : 'worktrees'
                  }`
                : 'Repair links'
            }
            cancelButtonText="Close"
            okButtonDisabled={
              busy || !checks.some(c => c.status === 'repairable')
            }
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
