import * as React from 'react'
import type { IBYOKProvider } from '../../lib/ai/providers'
import { Button } from '../lib/button'

interface IAIProvidersPreferencesProps {
  readonly providers: ReadonlyArray<IBYOKProvider>
  readonly onConfigureProviders: () => void
}

/** Local provider configuration without an account or inference client. */
export function AIProvidersPreferences(props: IAIProvidersPreferencesProps) {
  return (
    <div className="copilot-section">
      <h2>AI providers</h2>
      <p>
        Manage your own endpoints, models and credentials. No GitHub account or
        Copilot plan is required.
      </p>
      <p>
        {props.providers.length} configured providers. Saving settings does not
        contact a provider or enable AI features.
      </p>
      <Button onClick={props.onConfigureProviders}>Manage providers</Button>
    </div>
  )
}
