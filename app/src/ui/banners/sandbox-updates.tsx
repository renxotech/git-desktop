import * as React from 'react'
import { ISandboxUpdateResult } from '../../lib/git/sandbox-rule'
import { PopupType } from '../../models/popup'
import { Dispatcher } from '../dispatcher'
import { LinkButton } from '../lib/link-button'
import { Banner } from './banner'

interface IProps {
  readonly results: ReadonlyArray<ISandboxUpdateResult>
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

export class SandboxUpdatesBanner extends React.Component<IProps> {
  private showDetails = () =>
    this.props.dispatcher.showPopup({
      type: PopupType.SandboxRuleResults,
      results: this.props.results,
    })
  public render() {
    const updated = this.props.results.filter(
      r => r.status === 'updated'
    ).length
    const blocked = this.props.results.filter(
      r => r.status === 'blocked' || r.status === 'failed'
    ).length
    return (
      <Banner
        id="sandbox-updates"
        onDismissed={this.props.onDismissed}
        timeout={blocked ? undefined : 5000}
      >
        <div className="banner-message">
          {updated} sandbox{updated === 1 ? '' : 'es'} updated
          {blocked ? `; ${blocked} need attention` : ''}.{' '}
          <LinkButton onClick={this.showDetails}>View details</LinkButton>
        </div>
      </Banner>
    )
  }
}
