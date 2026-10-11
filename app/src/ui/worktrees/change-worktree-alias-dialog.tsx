import * as React from 'react'
import * as Path from 'path'
import { getWorktreeAlias, setWorktreeAlias } from '../../lib/worktree-alias'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
interface IProps {
  readonly worktreePath: string
  readonly onAliasChanged: () => void
  readonly onDismissed: () => void
}
export class ChangeWorktreeAliasDialog extends React.Component<
  IProps,
  { readonly alias: string }
> {
  public constructor(props: IProps) {
    super(props)
    this.state = {
      alias:
        getWorktreeAlias(props.worktreePath) ??
        Path.basename(props.worktreePath),
    }
  }
  private onSubmit = () => {
    setWorktreeAlias(this.props.worktreePath, this.state.alias)
    this.props.onAliasChanged()
    this.props.onDismissed()
  }
  private onValueChanged = (alias: string) => this.setState({ alias })
  public render() {
    const verb =
      getWorktreeAlias(this.props.worktreePath) === null ? 'Create' : 'Change'
    return (
      <Dialog
        id="change-worktree-alias"
        title={__DARWIN__ ? verb + ' Worktree Alias' : verb + ' worktree alias'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        ariaDescribedBy="change-worktree-alias-description"
      >
        <DialogContent>
          <p id="change-worktree-alias-description">
            Choose an alias for the worktree "
            {Path.basename(this.props.worktreePath)}".
          </p>
          <TextBox
            ariaLabel="Alias"
            value={this.state.alias}
            onValueChanged={this.onValueChanged}
          />
          <p className="description">
            The folder name and branch will stay the same.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={verb + ' alias'}
            okButtonDisabled={this.state.alias.trim().length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
