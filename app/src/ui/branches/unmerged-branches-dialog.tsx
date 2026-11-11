import {
  checkWorktreeBranchRemoval,
  IWorktreeBranchRemoval,
} from '../../lib/git/worktree-branch-removal'
import * as React from 'react'
import { errorMessage } from '../../lib/repository-health'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { DeleteBranch, DeleteRemoteBranch } from '../delete-branch'
import { ComputedAction } from '../../models/computed-action'
import { determineMergeability } from '../../lib/git/merge-tree'
import {
  getUnmergedBranches,
  getUnmergedBranchTargets,
  IBranchTarget,
  IUnmergedBranch,
} from '../../lib/git/unmerged-branches'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { Select } from '../lib/select'

interface IProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly merged?: boolean
  readonly allBranches: ReadonlyArray<Branch>
  readonly currentBranch: Branch | null
  readonly defaultBranch: Branch | null
  readonly onDismissed: () => void
}
interface IState {
  readonly target: string
  readonly targets: ReadonlyArray<IBranchTarget>
  readonly branches: ReadonlyArray<IUnmergedBranch>
  readonly includeRemotes: boolean
  readonly busy: boolean
  readonly error: string | null
  readonly selected: string
  readonly filter: string
  readonly includeIgnored: boolean
  readonly includeSubmodules: boolean
  readonly metadataBackup: string | null
  readonly removal: IWorktreeBranchRemoval | null
  readonly deleting: Branch | null
}
export class UnmergedBranchesDialog extends React.Component<IProps, IState> {
  private request = 0
  public constructor(props: IProps) {
    super(props)
    this.state = {
      target: 'HEAD',
      targets: [],
      branches: [],
      includeRemotes: false,
      busy: true,
      error: null,
      selected: '',
      filter: '',
      deleting: null,
      removal: null,
      includeIgnored: false,
      includeSubmodules: false,
      metadataBackup: null,
    }
  }
  public componentDidMount() {
    this.refresh()
  }
  public componentWillUnmount() {
    this.request++
  }
  private refresh = async () => {
    const request = ++this.request
    this.setState({ busy: true, error: null, selected: '' })
    try {
      const [targets, branches] = await Promise.all([
        getUnmergedBranchTargets(this.props.repository.path),
        getUnmergedBranches(
          this.props.repository.path,
          this.state.target,
          this.props.merged
        ),
      ])
      if (request === this.request) {
        this.setState({ targets, branches, busy: false })
      }
    } catch (error) {
      if (request === this.request) {
        this.setState({ branches: [], busy: false, error: errorMessage(error) })
      }
    }
  }
  private removalReason(branch: IUnmergedBranch | undefined): string | null {
    if (!branch) {
      return 'Select a branch.'
    }
    if (branch.ref === this.props.currentBranch?.ref) {
      return 'The current branch cannot be removed.'
    }
    const defaultBranch = this.props.defaultBranch
    if (
      branch.ref === defaultBranch?.ref ||
      branch.name === defaultBranch?.upstream
    ) {
      return 'The default branch cannot be removed.'
    }
    if (branch.worktreePaths.length) {
      return 'This branch is checked out in a worktree.'
    }
    return null
  }
  private merge = async () => {
    const branch = this.props.allBranches.find(
      b => b.ref === this.state.selected
    )
    const current = this.props.currentBranch
    if (
      !branch ||
      !current ||
      this.state.target !== 'HEAD' ||
      this.state.busy
    ) {
      return
    }
    this.setState({ busy: true, error: null })
    const request = ++this.request
    try {
      const status = await determineMergeability(
        this.props.repository,
        current,
        branch
      )
      if (request !== this.request) {
        return
      }
      if (
        status.kind === ComputedAction.Invalid ||
        status.kind === ComputedAction.Loading
      ) {
        this.setState({
          busy: false,
          error: 'These branches cannot be merged.',
        })
        return
      }
      await this.props.dispatcher.mergeFromBranchList(
        this.props.repository,
        branch,
        status
      )
    } catch (error) {
      if (request === this.request) {
        this.setState({ busy: false, error: errorMessage(error) })
      }
    }
  }
  private onTargetChanged = (e: React.FormEvent<HTMLSelectElement>) =>
    this.setState({ target: e.currentTarget.value }, this.refresh)
  private onFilterChanged = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ filter: e.currentTarget.value, selected: '' })
  private onRemotesChanged = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ includeRemotes: e.currentTarget.checked, selected: '' })
  private onSelectionChanged = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ selected: e.currentTarget.value })
  private onRemove = () => {
    const branch = this.state.branches.find(b => b.ref === this.state.selected)
    const selected = this.props.allBranches.find(b => b.ref === branch?.ref)
    if (!this.state.busy && selected && this.removalReason(branch) === null) {
      this.setState({ deleting: selected })
    }
  }

  private onRemoveWorktree = async () => {
    const branch = this.state.branches.find(b => b.ref === this.state.selected)
    if (
      this.state.busy ||
      !branch ||
      this.removalReason(branch) !== 'This branch is checked out in a worktree.'
    ) {
      return
    }
    this.setState({ busy: true, error: null })
    const request = ++this.request
    try {
      const removal = await checkWorktreeBranchRemoval(
        this.props.repository.path,
        branch.ref,
        this.state.target
      )
      if (request === this.request) {
        this.setState({
          removal,
          busy: false,
          includeIgnored: false,
          includeSubmodules: false,
        })
      }
    } catch (error) {
      if (request === this.request) {
        this.setState({ error: errorMessage(error), busy: false })
      }
    }
  }
  private onIgnoredChanged = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ includeIgnored: e.currentTarget.checked })
  private onSubmodulesChanged = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ includeSubmodules: e.currentTarget.checked })
  private onCancelRemoval = () => this.setState({ removal: null, error: null })
  private onConfirmRemoval = async () => {
    if (!this.state.removal || this.state.busy) {
      return
    }
    this.setState({ busy: true, error: null })
    try {
      const metadataBackup =
        await this.props.dispatcher.removeMergedWorktreeAndBranch(
          this.props.repository,
          this.state.removal,
          this.state.includeIgnored,
          this.state.includeSubmodules
        )
      this.setState({ removal: null, metadataBackup })
      await this.refresh()
    } catch (error) {
      this.setState({ busy: false, error: errorMessage(error) })
    }
  }

  public render() {
    const { busy, target, targets, error, includeRemotes, deleting } =
      this.state
    const merged = this.props.merged === true
    const currentUpstream = this.props.currentBranch?.upstream
    const currentUpstreamRef = currentUpstream
      ? `refs/remotes/${currentUpstream}`
      : null
    const branches = this.state.branches.filter(
      b =>
        (!merged ||
          (b.ref !== this.props.currentBranch?.ref &&
            b.ref !== currentUpstreamRef)) &&
        (includeRemotes || !b.remote) &&
        b.name.toLowerCase().includes(this.state.filter.toLowerCase())
    )
    const selectedResult = branches.find(b => b.ref === this.state.selected)
    const selected =
      selectedResult &&
      this.props.allBranches.find(b => b.ref === selectedResult.ref)
    const reason = this.removalReason(selectedResult)
    const removal = this.state.removal
    if (removal) {
      const blocked =
        removal.hasFiles ||
        (removal.ignoredPaths.length > 0 && !this.state.includeIgnored) ||
        ((removal.submodules.length > 0 || removal.metadataPaths.length > 0) &&
          !this.state.includeSubmodules)
      return (
        <Dialog
          id="remove-worktree-branch"
          title="Remove worktree and branch"
          type="warning"
          onDismissed={this.onCancelRemoval}
          disabled={busy}
        >
          <DialogContent>
            <p>
              Remove local branch{' '}
              <strong>{removal.branchRef.replace('refs/heads/', '')}</strong>{' '}
              and its worktree folder?
            </p>
            <p className="health-path">{removal.path}</p>
            <p>The folder will be deleted. The remote branch will be kept.</p>
            {removal.hasFiles && (
              <p>
                Uncommitted or untracked files are present. Commit or move those
                files before removal.
              </p>
            )}
            {removal.hasFiles && (
              <ul>
                {[...removal.changedPaths, ...removal.untrackedPaths].map(
                  path => (
                    <li key={path}>{path}</li>
                  )
                )}
              </ul>
            )}
            {removal.ignoredPaths.length > 0 && (
              <>
                <p>
                  Ignored files may include dependencies, build output or local
                  configuration. Review these paths before deleting them.
                  Directory links and junctions will be unlinked; their targets
                  will be kept:
                </p>
                <ul>
                  {removal.ignoredPaths.map(path => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
                <label>
                  <input
                    type="checkbox"
                    checked={this.state.includeIgnored}
                    onChange={this.onIgnoredChanged}
                    disabled={busy}
                  />{' '}
                  Delete these ignored files with the worktree
                </label>
              </>
            )}
            {(removal.submodules.length > 0 ||
              removal.metadataPaths.length > 0) && (
              <>
                <p>
                  Submodule checkouts will be removed. Their complete Git
                  metadata, including local refs, stashes and reflogs, will be
                  retained here:
                </p>
                <p className="health-path">{removal.metadataBackupRoot}</p>
                <ul>
                  {removal.submodules.map(module => (
                    <li key={module.path}>
                      {module.path}:{' '}
                      {module.state === 'incomplete'
                        ? 'empty checkout with missing index; intent is unknown'
                        : module.state}
                      {module.blockers.map(reason => (
                        <p key={reason}>{reason}</p>
                      ))}
                    </li>
                  ))}
                </ul>
                <label>
                  <input
                    type="checkbox"
                    checked={this.state.includeSubmodules}
                    onChange={this.onSubmodulesChanged}
                    disabled={busy}
                  />{' '}
                  Remove these submodule checkouts and retain their Git metadata
                </label>
              </>
            )}
            <p>All existing stashes will be preserved.</p>
            {!blocked && (
              <p>
                No uncommitted or untracked files block removal. Checks will run
                again before removal.
              </p>
            )}
            {error && <p className="health-error">{error}</p>}
          </DialogContent>
          <DialogFooter>
            <Button disabled={busy} onClick={this.onCancelRemoval}>
              Back
            </Button>
            <Button disabled={busy || blocked} onClick={this.onConfirmRemoval}>
              Remove worktree and branch
            </Button>
          </DialogFooter>
        </Dialog>
      )
    }
    if (deleting) {
      const common = {
        dispatcher: this.props.dispatcher,
        repository: this.props.repository,
        branch: deleting,
        onDismissed: () => {
          this.setState({ deleting: null })
          this.refresh()
        },
        onDeleted: () => {
          this.setState({ deleting: null })
          this.refresh()
        },
      }
      return deleting.type === BranchType.Remote ? (
        <DeleteRemoteBranch {...common} />
      ) : (
        <DeleteBranch
          {...common}
          existsOnRemote={this.props.allBranches.some(
            b => b.name === deleting.upstream
          )}
        />
      )
    }
    return (
      <Dialog
        id="unmerged-branches"
        title={merged ? 'Merged branches' : 'Unmerged branches'}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p className="health-path">{this.props.repository.path}</p>
          {this.state.metadataBackup && (
            <p>
              Worktree removed. Submodule Git metadata retained at:{' '}
              <span className="health-path">{this.state.metadataBackup}</span>
            </p>
          )}
          <Select
            label={merged ? 'Merged into' : 'Not merged into'}
            value={target}
            disabled={busy}
            onChange={this.onTargetChanged}
          >
            <option value="HEAD">
              Current branch:{' '}
              {this.props.currentBranch?.name ?? 'detached HEAD'}
            </option>
            {targets.map(b => (
              <option key={b.ref} value={b.ref}>
                {b.name}
                {b.remote ? ' (remote)' : ''}
              </option>
            ))}
          </Select>
          <input
            aria-label="Filter branches"
            placeholder="Filter branches"
            value={this.state.filter}
            onChange={this.onFilterChanged}
          />
          <label>
            <input
              type="checkbox"
              checked={includeRemotes}
              onChange={this.onRemotesChanged}
            />{' '}
            Include remote branches
          </label>
          <p>
            {merged
              ? 'Branch tips contained in the selected target’s history.'
              : 'Branches with commits outside the selected target’s history.'}{' '}
            This checks ancestry; squash merges and cherry-picks may still
            appear as unmerged. Remote branches use cached refs. Sorted by
            newest last commit.
          </p>
          <p role="status">
            {busy
              ? 'Checking branches…'
              : `${branches.length} ${merged ? 'merged' : 'unmerged'} branches`}
          </p>
          {error && <p className="health-error">{error}</p>}
          {!busy && !error && !branches.length && <p>No matching branches.</p>}
          {!busy && (
            <ul className="unmerged-branch-results">
              {branches.map(b => (
                <li key={b.ref}>
                  <label>
                    <input
                      type="radio"
                      name="selected-branch"
                      checked={this.state.selected === b.ref}
                      value={b.ref}
                      onChange={this.onSelectionChanged}
                    />
                    <strong>{b.name}</strong>{' '}
                    {b.remote ? '(remote)' : '(local)'}
                  </label>
                  {!merged && (
                    <span>
                      {b.commitsOutsideTarget} commits to merge
                      {b.commitsOnlyInTarget > 0
                        ? ` · Diverged: ${b.commitsOnlyInTarget} commits only in target`
                        : ''}{' '}
                      ·{' '}
                    </span>
                  )}
                  <span>{b.lastCommitDate}</span>
                  {b.worktreePaths.map(path => (
                    <div className="health-path" key={path}>
                      {path}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
        <DialogFooter>
          <span role="status">
            {merged
              ? reason ?? selected?.name
              : target !== 'HEAD'
              ? 'Switch to this branch to merge into it.'
              : `${selected?.name ?? 'Select a branch'} → ${
                  this.props.currentBranch?.name ?? 'detached HEAD'
                }`}
          </span>
          {merged && reason === 'This branch is checked out in a worktree.' && (
            <Button disabled={busy} onClick={this.onRemoveWorktree}>
              Remove worktree and branch…
            </Button>
          )}
          <Button
            disabled={
              busy ||
              !selected ||
              (merged
                ? reason !== null
                : target !== 'HEAD' || !this.props.currentBranch)
            }
            onClick={merged ? this.onRemove : this.merge}
          >
            {merged ? 'Remove Branch…' : 'Merge'}
          </Button>
          <Button disabled={busy} onClick={this.refresh}>
            Refresh
          </Button>
          <Button onClick={this.props.onDismissed}>Close</Button>
        </DialogFooter>
      </Dialog>
    )
  }
}
