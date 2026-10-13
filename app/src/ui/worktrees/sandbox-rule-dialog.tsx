import { errorMessage } from '../../lib/repository-health'
import * as React from 'react'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { IRemote } from '../../models/remote'
import { getRemotes } from '../../lib/git/remote'
import { git } from '../../lib/git/core'
import {
  saveSandboxRule,
  resolveTarget,
  withSandboxRuleQueue,
  resetInvalidSandboxRules,
} from '../../lib/git/sandbox-rule'
import {
  readSandboxRules,
  SandboxSelector,
  ISandboxRule,
  InvalidSandboxRulesError,
} from '../../lib/sandbox-rule'
import { sandboxReleaseLoader } from '../../lib/sandbox-release-loader'
import { fetch } from '../../lib/git/fetch'
import { parseRemote } from '../../lib/remote-parsing'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'

interface IProps {
  readonly repository: Repository
  readonly accounts: ReadonlyArray<Account>
  readonly dispatcher: Dispatcher
  readonly worktreePath: string
  readonly onChanged: () => void
  readonly onDismissed: () => void
}
interface IState {
  readonly loading: boolean
  readonly saving: boolean
  readonly checking: boolean
  readonly branch: string
  readonly remote: string
  readonly remotes: ReadonlyArray<IRemote>
  readonly selector: SandboxSelector | 'off'
  readonly sourceBranch: string
  readonly error: string | null
  readonly invalidRules: string | null
  readonly target: {
    readonly sha: string
    readonly tag?: string
    readonly tagObject?: string
  } | null
}

export class SandboxRuleDialog extends React.Component<IProps, IState> {
  public state: IState = {
    loading: true,
    saving: false,
    checking: false,
    branch: '',
    remote: '',
    remotes: [],
    selector: 'off',
    sourceBranch: 'development',
    error: null,
    invalidRules: null,
    target: null,
  }
  private mounted = false
  private originalRule: ISandboxRule | null = null
  public async componentDidMount() {
    this.mounted = true
    try {
      const [remotes, rules, head] = await Promise.all([
        getRemotes(this.props.repository),
        readSandboxRules(this.props.worktreePath),
        git(
          ['symbolic-ref', '--quiet', 'HEAD'],
          this.props.worktreePath,
          'sandboxSettingsBranch'
        ),
      ])
      const branch = head.stdout.trim()
      const rule = rules.find(r => r.branch === branch)
      this.originalRule = rule ?? null
      if (this.mounted) {
        this.setState({
          loading: false,
          remotes,
          branch,
          remote:
            rule?.remote ??
            remotes.find(r => r.name === 'upstream')?.name ??
            remotes[0]?.name ??
            '',
          selector: rule?.selector ?? 'off',
          sourceBranch: rule?.sourceBranch ?? 'development',
        })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({
          loading: false,
          error: errorMessage(error),
          invalidRules:
            error instanceof InvalidSandboxRulesError ? error.rawValue : null,
        })
      }
    }
  }
  public componentWillUnmount() {
    this.mounted = false
  }
  private onResetInvalidRules = async () => {
    const rawValue = this.state.invalidRules
    if (rawValue === null || this.state.saving) {
      return
    }
    this.setState({ saving: true })
    try {
      await resetInvalidSandboxRules(this.props.worktreePath, rawValue)
      this.props.onChanged()
      this.props.onDismissed()
    } catch (error) {
      if (this.mounted) {
        this.setState({ saving: false, error: errorMessage(error) })
      }
    }
  }
  private onSelectorChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const selector = event.currentTarget.value as IState['selector']
    this.setState({
      selector,
      target: null,
      sourceBranch:
        selector === 'tag'
          ? 'release-'
          : selector === 'branch'
          ? 'development'
          : this.state.sourceBranch,
    })
  }
  private onRemoteChanged = (event: React.FormEvent<HTMLSelectElement>) =>
    this.setState({ remote: event.currentTarget.value, target: null })
  private onSourceChanged = (sourceBranch: string) =>
    this.setState({ sourceBranch, target: null })
  private getRule = (): ISandboxRule | null => {
    const { branch, selector, sourceBranch } = this.state
    if (selector === 'off') {
      return null
    }
    const remote = this.state.remotes.find(r => r.name === this.state.remote)
    if (!remote) {
      throw new Error('Select an available source remote.')
    }
    if (
      (selector === 'beta' || selector === 'stable') &&
      parseRemote(remote.url)?.hostname !== 'github.com'
    ) {
      throw new Error(
        'Published release rules require a github.com source. Use a matching version tag rule for other remotes.'
      )
    }
    const prior = this.originalRule
    const retainIdentity =
      prior?.remoteURL === remote.url &&
      prior.remote === remote.name &&
      prior.selector === selector &&
      prior.sourceBranch === sourceBranch.trim()
    return {
      version: 1,
      branch,
      worktreePath: this.props.worktreePath,
      remote: remote.name,
      remoteURL: remote.url,
      selector,
      sourceBranch: sourceBranch.trim(),
      lastTag: retainIdentity ? prior?.lastTag : undefined,
      lastTagObject: retainIdentity ? prior?.lastTagObject : undefined,
    }
  }
  private onCheckTarget = async () => {
    this.setState({ checking: true, error: null, target: null })
    try {
      const rule = this.getRule()
      if (!rule) {
        return
      }
      const target = await withSandboxRuleQueue(
        this.props.repository.path,
        async () => {
          await fetch(this.props.repository, {
            name: rule.remote,
            url: rule.remoteURL,
          })
          return resolveTarget(this.props.repository.path, rule, () =>
            sandboxReleaseLoader(this.props.accounts)(rule.remoteURL)
          )
        }
      )
      if (this.mounted) {
        this.setState({ target })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({ error: errorMessage(error) })
      }
    } finally {
      if (this.mounted) {
        this.setState({ checking: false })
      }
    }
  }
  private onCreateAtSource = () => {
    try {
      const rule = this.getRule()
      if (!rule || !this.state.target) {
        return
      }
      this.props.dispatcher.showPopup({
        type: PopupType.AddWorktree,
        repository: this.props.repository,
        initialStartPoint: this.state.target.sha,
        initialSandboxRule: {
          ...rule,
          lastTag: this.state.target.tag,
          lastTagObject: this.state.target.tagObject,
        },
      })
    } catch (error) {
      this.setState({ error: errorMessage(error) })
    }
  }
  private onCreateWorkingSandbox = async () => {
    try {
      const result = await git(
        ['rev-parse', 'HEAD'],
        this.props.worktreePath,
        'workingSandboxStartPoint'
      )
      this.props.dispatcher.showPopup({
        type: PopupType.AddWorktree,
        repository: this.props.repository,
        initialStartPoint: result.stdout.trim(),
      })
    } catch (error) {
      if (this.mounted) {
        this.setState({ error: errorMessage(error) })
      }
    }
  }
  private onSubmit = async () => {
    if (this.state.loading || this.state.saving || this.state.checking) {
      return
    }
    this.setState({ saving: true, error: null })
    try {
      await saveSandboxRule(
        this.props.worktreePath,
        this.state.branch,
        this.getRule()
      )
      this.props.onChanged()
      this.props.onDismissed()
    } catch (error) {
      if (this.mounted) {
        this.setState({ saving: false, error: errorMessage(error) })
      }
    }
  }
  public render() {
    const { loading, selector, remotes } = this.state
    const busy = this.state.saving || this.state.checking
    return (
      <Dialog
        id="sandbox-fast-forward-rule"
        title="Fast-forward rule"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p>Sandbox: {this.props.worktreePath}</p>
          <p>
            Branch:{' '}
            {this.state.branch.replace(/^refs\/heads\//, '') || 'Loading…'}
          </p>
          {this.originalRule?.lastCheckedAt && (
            <p>
              Last check: {this.originalRule.lastCheckedAt} ·{' '}
              {this.originalRule.lastStatus}: {this.originalRule.lastMessage}
            </p>
          )}
          <Select
            label="Follow"
            value={selector}
            disabled={loading || busy}
            onChange={this.onSelectorChanged}
          >
            <option value="off">No fast-forward rule</option>
            <option value="branch">Remote branch</option>
            <option value="beta">Latest published beta release</option>
            <option value="stable">Latest published stable release</option>
            <option value="tag">Latest matching version tag (Git only)</option>
          </Select>
          {selector !== 'off' && (
            <>
              <Select
                label="Source remote"
                value={this.state.remote}
                disabled={loading || busy}
                onChange={this.onRemoteChanged}
              >
                {remotes.map(r => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </Select>
              <p className="description">
                {remotes.find(r => r.name === this.state.remote)?.url}
              </p>
              {selector === 'branch' && (
                <TextBox
                  label="Source branch"
                  value={this.state.sourceBranch}
                  disabled={busy}
                  onValueChanged={this.onSourceChanged}
                />
              )}
              {selector === 'tag' && (
                <>
                  <TextBox
                    label="Tag prefix"
                    value={this.state.sourceBranch}
                    disabled={busy}
                    onValueChanged={this.onSourceChanged}
                  />
                  <p>
                    Follows the highest semantic version after this literal
                    prefix (for example release-). A tag does not establish
                    release publication.
                  </p>
                </>
              )}
              {(selector === 'beta' || selector === 'stable') && (
                <p>
                  Published releases on github.com with release-X.Y.Z
                  {selector === 'beta' ? '-betaN' : ''} tags.
                </p>
              )}
              <p>
                Fetch/Pull will fast-forward this sandbox to its source. Commits
                and history changes are blocked while this rule is enabled.
                External editors can still change files; local changes block
                updates.
              </p>
              <Button
                type="button"
                disabled={busy || loading}
                onClick={this.onCheckTarget}
              >
                {this.state.checking ? 'Checking…' : 'Check source target'}
              </Button>
              {this.state.target && (
                <p>
                  Target: {this.state.target.tag ?? 'Remote branch tip'} ·{' '}
                  {this.state.target.sha.substring(0, 10)}
                </p>
              )}
              <Button
                type="button"
                disabled={busy || this.state.target === null}
                onClick={this.onCreateAtSource}
              >
                Create new sandbox at source…
              </Button>
            </>
          )}
          <Button
            type="button"
            disabled={loading || busy || !this.state.branch}
            onClick={this.onCreateWorkingSandbox}
          >
            Create working sandbox…
          </Button>
          {this.state.error && <p role="alert">{this.state.error}</p>}
          {this.state.invalidRules !== null && (
            <>
              <pre>{this.state.invalidRules}</pre>
              <p>
                Reset disables all fast-forward rules for this repository and
                its linked worktrees. The invalid value is saved in local Git
                configuration as desktop.sandboxRulesBackup.
              </p>
              <Button
                type="button"
                disabled={busy}
                onClick={this.onResetInvalidRules}
              >
                Back up and reset all rules
              </Button>
            </>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={this.state.saving ? 'Saving…' : 'Save rule'}
            okButtonDisabled={
              loading ||
              busy ||
              !this.state.branch ||
              (selector !== 'off' && !this.state.remote)
            }
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
