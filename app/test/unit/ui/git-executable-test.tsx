import assert from 'node:assert/strict'
import { beforeEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
import type { GitExecutableSelection } from '../../../src/lib/git/executable'

let activeFails = false
let checkFails = false
const chosenPath = 'C:\\Git with spaces\\cmd\\git.exe'
const validate = mock.fn(async (_selection: GitExecutableSelection) => {
  if (checkFails) {
    throw new Error('Git is too old')
  }
  return { version: '2.55.0', lfsAvailable: true }
})

mock.module('../../../src/lib/git/executable.ts', {
  namedExports: {
    MinimumGitVersion: '2.46.0',
    getGitExecutable: async () => {
      if (activeFails) {
        throw new Error('Selected Git is missing; choose bundled Git')
      }
      return { path: chosenPath, version: '2.55.0' }
    },
    discoverInstalledGit: async () => chosenPath,
    validateGitExecutable: validate,
  },
})
mock.module('../../../src/ui/main-process-proxy.ts', {
  namedExports: { showOpenDialog: async () => chosenPath },
})

beforeEach(() => {
  activeFails = false
  checkFails = false
  validate.mock.resetCalls()
})

async function mount(
  selection: GitExecutableSelection = { kind: 'installed', path: '' }
) {
  const { GitExecutable } = await import(
    '../../../src/ui/preferences/git-executable'
  )
  const changes: GitExecutableSelection[] = []
  render(
    <GitExecutable
      selection={selection}
      onChange={value => changes.push(value)}
    />
  )
  return changes
}

describe('Git executable preferences', () => {
  it('preserves the complete executable path from the file picker', async () => {
    const changes = await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }))
    await waitFor(() =>
      assert.deepEqual(changes, [{ kind: 'installed', path: chosenPath }])
    )
  })

  it('discovers installed Git and lets the user select bundled fallback explicitly', async () => {
    const changes = await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Find on PATH' }))
    await waitFor(() => assert.equal(changes.length, 1))
    assert.deepEqual(changes[0], { kind: 'installed', path: chosenPath })
    fireEvent.change(screen.getByRole('combobox', { name: 'Git executable' }), {
      target: { value: 'bundled' },
    })
    assert.deepEqual(changes[1], { kind: 'bundled' })
    assert.match(document.body.textContent ?? '', /Save and restart/)
  })

  it('reports compatibility failures without changing the selection', async () => {
    checkFails = true
    const changes = await mount({ kind: 'installed', path: chosenPath })
    fireEvent.click(screen.getByRole('button', { name: 'Check compatibility' }))
    await waitFor(() =>
      assert.match(screen.getByRole('status').textContent ?? '', /too old/)
    )
    assert.deepEqual(validate.mock.calls[0].arguments, [
      { kind: 'installed', path: chosenPath },
    ])
    assert.deepEqual(changes, [])
  })

  it('keeps fallback controls available when the active Git is missing', async () => {
    activeFails = true
    const changes = await mount({ kind: 'installed', path: chosenPath })
    await screen.findByText(/Selected Git is missing/)
    fireEvent.change(screen.getByRole('combobox', { name: 'Git executable' }), {
      target: { value: 'bundled' },
    })
    assert.deepEqual(changes, [{ kind: 'bundled' }])
  })
})
