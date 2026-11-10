import * as React from 'react'
import { Repository } from '../../models/repository'
import { listWorktrees } from '../../lib/git/worktree'
import {
  suggestArtifactConfig,
  parseArtifactConfig,
  previewArtifacts,
  cleanArtifacts,
  IArtifactPlan,
} from '../../lib/artifact-cleanup'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'

interface IProps {
  readonly repository: Repository
  readonly onDismissed: () => void
}
interface IEntry {
  readonly root: string
  readonly config: string
  readonly selected: boolean
}
interface IState {
  readonly entries: ReadonlyArray<IEntry>
  readonly hours: string
  readonly dependencies: boolean
  readonly caches: boolean
  readonly busy: boolean
  readonly plan: IArtifactPlan | null
  readonly message: string
}
/** Repository-wide artifact cleanup with an explicit review step. */
export class ArtifactCleanupDialog extends React.Component<IProps, IState> {
  public state: IState = {
    entries: [],
    hours: '24',
    dependencies: false,
    caches: false,
    busy: true,
    plan: null,
    message: '',
  }
  private disposed = false
  private cancelled = false
  public componentDidMount() {
    this.load()
  }
  public componentWillUnmount() {
    this.disposed = true
    this.cancelled = true
  }
  private load = async () => {
    try {
      const entries: IEntry[] = []
      const messages: string[] = []
      for (const tree of await listWorktrees(this.props.repository)) {
        try {
          entries.push({
            root: tree.path,
            config: await suggestArtifactConfig(tree.path),
            selected: !tree.isLocked && !tree.isPrunable,
          })
        } catch (error) {
          messages.push(`${tree.path}: ${String(error)}`)
          entries.push({
            root: tree.path,
            config: '{"version":1,"keepHours":24,"artifacts":[]}',
            selected: false,
          })
        }
      }
      if (!this.disposed) {
        this.setState({
          entries,
          hours: String(
            entries.length
              ? parseArtifactConfig(entries[0].config).keepHours
              : 24
          ),
          busy: false,
          message: messages.join('\n'),
        })
      }
    } catch (error) {
      if (!this.disposed) {
        this.setState({ busy: false, message: String(error) })
      }
    }
  }
  private updateEntry = (root: string, change: Partial<IEntry>) => {
    this.setState({
      entries: this.state.entries.map(e =>
        e.root === root ? { ...e, ...change } : e
      ),
      plan: null,
      message: '',
    })
  }
  private preview = async () => {
    this.cancelled = false
    this.setState({
      busy: true,
      plan: null,
      message: 'Scanning artifact folders…',
    })
    try {
      if (this.state.hours.trim() === '') {
        throw new Error('Enter a retention period.')
      }
      const overrides = new Map<string, string>()
      for (const entry of this.state.entries.filter(e => e.selected)) {
        const config = parseArtifactConfig(entry.config)
        if (config.artifacts.length === 0) {
          throw new Error(
            `Configure artifact paths for ${entry.root}. Example: {"version":1,"artifacts":[{"path":"dist","kind":"output"}]}`
          )
        }
        overrides.set(entry.root, entry.config)
      }
      const kinds: Array<'output' | 'dependencies' | 'cache'> = ['output']
      if (this.state.dependencies) {
        kinds.push('dependencies')
      }
      if (this.state.caches) {
        kinds.push('cache')
      }
      const plan = await previewArtifacts(
        this.props.repository.path,
        Number(this.state.hours),
        overrides,
        kinds,
        () => this.cancelled
      )
      if (!this.disposed) {
        this.setState({ plan, busy: false, message: '' })
      }
    } catch (error) {
      if (!this.disposed) {
        this.setState({ busy: false, message: String(error) })
      }
    }
  }
  private clean = async () => {
    const plan = this.state.plan
    if (!plan || this.state.busy) {
      return
    }
    this.cancelled = false
    this.setState({ busy: true, message: 'Cleaning reviewed folders…' })
    try {
      const results = await cleanArtifacts(plan, () => this.cancelled)
      if (!this.disposed) {
        this.setState({
          busy: false,
          plan: null,
          message: results.join('\n') || 'Nothing to clean.',
        })
      }
    } catch (error) {
      if (!this.disposed) {
        this.setState({ busy: false, plan: null, message: String(error) })
      }
    }
  }
  private dismiss = () => {
    if (this.state.busy) {
      this.cancelled = true
    } else {
      this.props.onDismissed()
    }
  }
  private cancel = () => {
    this.cancelled = true
  }
  private onHours = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ hours: e.currentTarget.value, plan: null })
  private onDependencies = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ dependencies: e.currentTarget.checked, plan: null })
  private onCaches = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.setState({ caches: e.currentTarget.checked, plan: null })
  private onSelected = (e: React.ChangeEvent<HTMLInputElement>) =>
    this.updateEntry(e.currentTarget.dataset.root ?? '', {
      selected: e.currentTarget.checked,
    })
  private onConfig = (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    this.updateEntry(e.currentTarget.dataset.root ?? '', {
      config: e.currentTarget.value,
    })
  public render() {
    const { busy, plan } = this.state
    const eligible = plan?.candidates.filter(c => c.reason === null) ?? []
    return (
      <Dialog
        id="artifact-cleanup"
        title="Clean build artifacts"
        onDismissed={this.dismiss}
        onSubmit={plan ? this.clean : this.preview}
        loading={busy}
      >
        <DialogContent>
          <p>
            Review generated folders across this repository’s worktrees. Stop
            builds, dev servers and editors using these folders before cleaning.
            Deletion is permanent.
          </p>
          <label>
            Keep artifacts changed within (hours; 0 removes all eligible ages)
            <input
              type="number"
              min="0"
              step="any"
              disabled={busy}
              value={this.state.hours}
              onChange={this.onHours}
            />
          </label>
          <p>
            Age measures changes, not last use. A recently changed file
            preserves its whole folder.
          </p>
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={this.state.dependencies}
              onChange={this.onDependencies}
            />
            Include dependencies (for example node_modules)
          </label>
          <br />
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={this.state.caches}
              onChange={this.onCaches}
            />
            Include rebuildable caches (close Unity before cleaning Library)
          </label>
          <p>
            Rules come from each worktree’s .gitdesktop-cleanup.json or
            suggested presets. Edit below to configure custom paths, including
            Go output directories. Edits apply to this session. Paths must be
            ignored by Git.
          </p>
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            {this.state.entries.map(entry => (
              <fieldset key={entry.root} disabled={busy}>
                <legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={entry.selected}
                      data-root={entry.root}
                      onChange={this.onSelected}
                    />
                    {entry.root}
                  </label>
                </legend>
                <textarea
                  aria-label={`Cleanup configuration for ${entry.root}`}
                  rows={5}
                  style={{ width: '100%' }}
                  value={entry.config}
                  data-root={entry.root}
                  onChange={this.onConfig}
                />
              </fieldset>
            ))}
          </div>
          {plan && (
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <p>
                {eligible.length} folders eligible; approximately{' '}
                {(eligible.reduce((n, c) => n + c.bytes, 0) / 1048576).toFixed(
                  1
                )}{' '}
                MB. Review every path below.
              </p>
              <ul>
                {plan.candidates.map(c => (
                  <li key={`${c.root}/${c.path}`}>
                    <strong>
                      {c.root}/{c.path}
                    </strong>
                    :{' '}
                    {c.reason ??
                      `Remove entire folder (${(c.bytes / 1048576).toFixed(
                        1
                      )} MB)`}
                  </li>
                ))}
              </ul>
              <Button onClick={this.preview}>Refresh preview</Button>
            </div>
          )}
          <pre role="status" style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.message}
          </pre>
          {busy && (
            <Button onClick={this.cancel}>Stop after current folder</Button>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={plan !== null}
            okButtonText={plan ? 'Delete eligible folders' : 'Preview cleanup'}
            okButtonDisabled={busy || (plan !== null && eligible.length === 0)}
            onCancelButtonClick={this.dismiss}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
