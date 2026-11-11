import * as React from 'react'
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { writeFile, mkdir } from 'fs/promises'
import * as Path from 'path'
import { setupEmptyRepository } from '../../helpers/repositories'
import { render, screen, fireEvent, waitFor } from '../../helpers/ui/render'
import { ArtifactCleanupDialog } from '../../../src/ui/repositories-list/artifact-cleanup-dialog'
import { git } from '../../../src/lib/git/core'

it('requires a preview before offering artifact deletion', async t => {
  const electron = await import('electron')
  const previous = electron.ipcRenderer.send
  electron.ipcRenderer.send = () => {}
  t.after(() => {
    electron.ipcRenderer.send = previous
  })
  const repo = await setupEmptyRepository(t)
  await writeFile(Path.join(repo.path, '.gitignore'), 'dist/\n')
  await writeFile(
    Path.join(repo.path, '.gitdesktop-cleanup.json'),
    JSON.stringify({
      version: 1,
      artifacts: [{ path: 'dist', kind: 'output' }],
    })
  )
  await git(['add', '.gitignore'], repo.path, 'test')
  await git(['commit', '-m', 'base'], repo.path, 'test')
  await mkdir(Path.join(repo.path, 'dist'))
  await writeFile(Path.join(repo.path, 'dist', 'output'), 'test')
  render(<ArtifactCleanupDialog repository={repo} onDismissed={() => {}} />)
  await waitFor(() =>
    assert.notEqual(
      screen.getByText('Preview cleanup').getAttribute('aria-disabled'),
      'true'
    )
  )
  assert.equal(screen.queryByText('Delete eligible folders'), null)
  fireEvent.change(screen.getByRole('spinbutton', { hidden: true }), {
    target: { value: '0' },
  })
  fireEvent.click(screen.getByText('Preview cleanup'))
  await waitFor(() => assert(screen.getByText('Delete eligible folders')))
  assert(screen.getByText(/Remove entire folder/))
})
