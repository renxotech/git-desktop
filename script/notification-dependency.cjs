const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const receipt = require('../vendor/desktop-notifications/script/build-receipt.cjs')

function check(root) {
  const vendor = path.join(root, 'vendor/desktop-notifications')
  const installed = path.join(root, 'app/node_modules/desktop-notifications')
  const names = receipt.inputs(vendor)
  const expected = receipt.hashes(vendor, names)
  const actual = receipt.hashes(installed, names)
  const built = JSON.parse(
    fs.readFileSync(path.join(installed, receipt.receiptName), 'utf8')
  )
  if (
    JSON.stringify(expected) !== JSON.stringify(actual) ||
    JSON.stringify(expected) !== JSON.stringify(built.inputs) ||
    JSON.stringify(receipt.hashes(installed, receipt.artifacts(installed))) !==
      JSON.stringify(built.artifacts) ||
    built.platform !== process.platform ||
    built.arch !== (process.env.npm_config_arch || process.arch)
  ) {
    throw new Error(
      'Installed notification sources or build outputs do not match this checkout.'
    )
  }
}

function repair(root) {
  const vendor = path.join(root, 'vendor/desktop-notifications')
  const installed = path.join(root, 'app/node_modules/desktop-notifications')
  // A worktree can share node_modules with another checkout. Never silently
  // replace a different checkout's dependency through a junction or symlink.
  const expectedPath = path.resolve(installed)
  const normalize = value =>
    process.platform === 'win32' ? value.toLowerCase() : value
  if (normalize(fs.realpathSync(installed)) !== normalize(expectedPath)) {
    throw new Error(
      'Notification dependencies are shared through a link. Repair their owning checkout instead.'
    )
  }
  const cli = process.env.npm_execpath
  if (!cli) {
    throw new Error('Run this repair through npm run repair:notifications.')
  }
  // Validate the complete write surface before mutating anything. node-gyp
  // replaces build/ and tsc writes dist/, so both must be local ordinary trees.
  receipt.files(installed, '.')
  const names = receipt.inputs(vendor)
  const installedSources = ['lib', 'src', 'script'].flatMap(name =>
    fs.existsSync(path.join(installed, name))
      ? receipt.files(installed, name)
      : []
  )
  if (installedSources.some(name => !names.includes(name))) {
    throw new Error(
      'Obsolete notification source files require a fresh dependency install with npm ci; preserve shared dependencies and run it only in their owning checkout.'
    )
  }
  fs.rmSync(path.join(installed, receipt.receiptName), { force: true })
  for (const name of names) {
    const destination = path.join(installed, name)
    // Refuse linked descendants as well as a linked package directory.
    let parent = path.dirname(destination)
    while (parent !== installed) {
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) {
        throw new Error(`Linked notification input is unsupported: ${parent}`)
      }
      parent = path.dirname(parent)
    }
    if (
      fs.existsSync(destination) &&
      fs.lstatSync(destination).isSymbolicLink()
    ) {
      throw new Error(
        `Linked notification input is unsupported: ${destination}`
      )
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(vendor, name), destination)
  }
  const result = spawnSync(
    process.execPath,
    [cli, '--prefix', installed, 'run', 'install'],
    { cwd: root, stdio: 'inherit' }
  )
  if (result.status !== 0) {
    throw (
      result.error ??
      new Error(
        'Notification rebuild failed. The dependency remains unverified; rerun the repair after resolving the build error.'
      )
    )
  }
  check(root)
}

module.exports = { check, repair }

if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..')
    if (process.argv.includes('--repair')) {
      repair(root)
    } else {
      check(root)
    }
    console.log(
      'Notification dependency matches vendor sources and compiled outputs.'
    )
  } catch (error) {
    console.error(
      `${error.message}\nClose active builds, then run npm run repair:notifications from this checkout. This refreshes only desktop-notifications; it does not install the full dependency graph.`
    )
    process.exitCode = 1
  }
}
