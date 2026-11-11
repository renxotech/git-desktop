// Cooperative lock shared by Codex writers and the daily integration workflow.
const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')
function git(root, ...args) {
  return cp
    .execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    .trim()
}
function clean(root) {
  if (
    git(
      root,
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--ignore-submodules=none'
    )
  )
    return false
  for (const name of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-merge',
    'rebase-apply',
  ]) {
    if (
      fs.existsSync(
        path.resolve(root, git(root, 'rev-parse', '--git-path', name))
      )
    )
      return false
  }
  return true
}
function location(root) {
  return path.resolve(
    root,
    git(root, 'rev-parse', '--git-common-dir'),
    'codex-upstream-sync'
  )
}
function begin(root, expectedBranch = 'desktop-improvements') {
  if (!clean(root) || git(root, 'branch', '--show-current') !== expectedBranch)
    return { skipped: 'dirty, busy, or different branch' }
  const dir = location(root)
  fs.mkdirSync(dir, { recursive: true })
  const lock = path.join(dir, 'lock')
  const handle = fs.openSync(lock, 'wx')
  fs.writeFileSync(
    handle,
    JSON.stringify({ pid: process.pid, started: new Date().toISOString() })
  )
  fs.closeSync(handle)
  return {
    dir,
    lock,
    head: git(root, 'rev-parse', 'HEAD'),
    branch: expectedBranch,
  }
}
function release(state) {
  if (state.lock) fs.unlinkSync(state.lock)
}
function prepare(root) {
  const state = begin(root)
  if (state.skipped) return state
  try {
    git(
      root,
      'fetch',
      '--no-tags',
      'upstream',
      '+refs/heads/development:refs/remotes/upstream/development'
    )
    const upstream = git(root, 'rev-parse', 'refs/remotes/upstream/development')
    const run = path.join(state.dir, `${Date.now()}-${process.pid}`)
    fs.mkdirSync(run)
    const candidate = path.join(run, 'candidate')
    git(root, 'worktree', 'add', '--detach', candidate, state.head)
    const record = { ...state, root, upstream, candidate, run }
    fs.writeFileSync(
      path.join(state.dir, 'active.json'),
      JSON.stringify(record, null, 2)
    )
    try {
      git(candidate, 'merge', '--no-commit', '--no-ff', upstream)
    } catch (error) {
      if (!git(candidate, 'ls-files', '-u')) throw error
    }
    return record
  } catch (error) {
    release(state)
    throw error
  }
}
function finish(root) {
  const state = JSON.parse(
    fs.readFileSync(path.join(location(root), 'active.json'))
  )
  const candidateHead = git(state.candidate, 'rev-parse', 'HEAD')
  if (!clean(state.candidate))
    throw Error('Candidate must be committed and clean')
  git(state.candidate, 'merge-base', '--is-ancestor', state.head, candidateHead)
  git(
    state.candidate,
    'merge-base',
    '--is-ancestor',
    state.upstream,
    candidateHead
  )
  const receipt = JSON.parse(
    fs.readFileSync(path.join(state.run, 'verified.json'))
  )
  if (
    receipt.head !== candidateHead ||
    receipt.tests !== true ||
    receipt.build !== true
  )
    throw Error('Missing exact-commit validation receipt')
  if (
    !clean(root) ||
    git(root, 'rev-parse', 'HEAD') !== state.head ||
    git(root, 'branch', '--show-current') !== state.branch
  )
    throw Error('Original checkout changed; retain candidate without promotion')
  git(root, 'merge', '--ff-only', candidateHead)
  fs.renameSync(
    path.join(state.dir, 'active.json'),
    path.join(state.run, 'completed.json')
  )
  release(state)
  return { promoted: candidateHead, output: state.run }
}
function abandon(root) {
  const dir = location(root)
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'active.json')))
  fs.renameSync(
    path.join(dir, 'active.json'),
    path.join(state.run, 'failed.json')
  )
  release(state)
  return { retained: state.run }
}
module.exports = { git, clean, begin, release, location, prepare, finish }
if (require.main === module) {
  const root = path.resolve(__dirname, '..')
  const action = process.argv[2]
  try {
    const result =
      action === 'prepare'
        ? prepare(root)
        : action === 'finish'
        ? finish(root)
        : action === 'abandon'
        ? abandon(root)
        : { clean: clean(root), state: location(root) }
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
