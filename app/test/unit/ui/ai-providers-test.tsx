import assert from 'node:assert/strict'
import { it } from 'node:test'
import * as React from 'react'
import { AIProvidersPreferences } from '../../../src/ui/preferences/ai-providers'
import { fireEvent, render, screen } from '../../helpers/ui/render'

it('opens provider management without an account or a network request', t => {
  const network = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Provider settings must not make requests')
  })
  let opened = 0
  render(
    <AIProvidersPreferences
      providers={[]}
      onConfigureProviders={() => opened++}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Manage providers' }))
  assert.equal(opened, 1)
  assert.equal(network.mock.callCount(), 0)
  assert.ok(screen.getByText(/No GitHub account/))
})
