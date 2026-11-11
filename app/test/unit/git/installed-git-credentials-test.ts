import assert from 'node:assert/strict'
import { before, after } from 'node:test'
import {
  discoverInstalledGit,
  getGitExecutable,
  saveGitExecutableSelection,
} from '../../../src/lib/git/executable'

// Run the existing end-to-end credential-renewal/HTTP-push scenario in its
// own test process with installed Git selected before any operation starts.
import './refreshable-credentials-test'

before(async () => {
  const path = await discoverInstalledGit()
  assert.ok(path, 'Installed Git is required for this integration test')
  saveGitExecutableSelection({ kind: 'installed', path })
})

after(async () => {
  assert.equal((await getGitExecutable()).selection.kind, 'installed')
})
