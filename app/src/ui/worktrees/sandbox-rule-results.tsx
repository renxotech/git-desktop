import * as React from 'react'
import { ISandboxUpdateResult } from '../../lib/git/sandbox-rule'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'

export function SandboxRuleResults(props: {
  readonly results: ReadonlyArray<ISandboxUpdateResult>
  readonly onDismissed: () => void
}) {
  return (
    <Dialog
      id="sandbox-rule-results"
      title="Sandbox updates"
      onDismissed={props.onDismissed}
    >
      <DialogContent>
        <ul>
          {props.results.map(r => (
            <li key={r.branch}>
              <strong>{r.branch.replace(/^refs\/heads\//, '')}</strong>:{' '}
              {r.status} — {r.message}
            </li>
          ))}
        </ul>
        <p>
          Blocked sandboxes were left unchanged. Failed rows describe any
          partial update. Resolve local changes or edit the fast-forward rule,
          then Fetch again.
        </p>
      </DialogContent>
      <DialogFooter>
        <Button onClick={props.onDismissed}>Close</Button>
      </DialogFooter>
    </Dialog>
  )
}
