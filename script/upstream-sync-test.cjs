const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  git,
  clean,
  begin,
  release,
  location,
  prepare,
  finish,
} = require('./upstream-sync.cjs')
test('isolated merge, exact receipt, changed original, lock and clean gates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'))
  git(root, 'init', '-b', 'desktop-improvements')
  git(root, 'config', 'user.name', 'Fixture')
  git(root, 'config', 'user.email', 'fixture@example.invalid')
  fs.writeFileSync(path.join(root, 'file'), 'base')
  git(root, 'add', 'file')
  git(root, 'commit', '-m', 'base')
  assert.equal(clean(root), true)
  fs.writeFileSync(path.join(root, 'untracked'), 'keep')
  assert.match(begin(root).skipped, /dirty/)
  fs.unlinkSync(path.join(root, 'untracked'))
  const held = begin(root)
  assert.throws(() => begin(root), /EEXIST/)
  release(held)
  git(root, 'branch', 'development')
  git(root, 'remote', 'add', 'upstream', root)
  git(root, 'checkout', 'development')
  fs.writeFileSync(path.join(root, 'incoming'), 'new')
  git(root, 'add', 'incoming')
  git(root, 'commit', '-m', 'incoming')
  git(root, 'checkout', 'desktop-improvements')
  const state = prepare(root)
  assert.equal(fs.existsSync(path.join(root, 'incoming')), false)
  git(state.candidate, 'commit', '-m', 'integration')
  assert.throws(() => finish(root), /ENOENT/)
  const head = git(state.candidate, 'rev-parse', 'HEAD')
  fs.writeFileSync(
    path.join(state.run, 'verified.json'),
    JSON.stringify({ head: 'wrong', tests: true, build: true })
  )
  assert.throws(() => finish(root), /receipt/)
  fs.writeFileSync(
    path.join(state.run, 'verified.json'),
    JSON.stringify({ head, tests: true, build: true })
  )
  fs.writeFileSync(path.join(root, 'foreign'), 'preserve')
  assert.throws(() => finish(root), /changed/)
  assert.equal(fs.readFileSync(path.join(root, 'foreign'), 'utf8'), 'preserve')
  fs.unlinkSync(path.join(root, 'foreign'))
  assert.equal(finish(root).promoted, head)
  assert.equal(fs.readFileSync(path.join(root, 'incoming'), 'utf8'), 'new')
  assert.equal(fs.existsSync(path.join(location(root), 'lock')), false)
  // Retain disposable fixture when diagnosing failures; remove owned successful fixture.
  fs.rmSync(root, { recursive: true })
})
