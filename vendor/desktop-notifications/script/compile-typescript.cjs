const { dirname, join } = require('node:path')
const { spawnSync } = require('node:child_process')

// Installed application packages resolve the root native compiler alias;
// standalone vendor installs resolve their own pinned TypeScript 7 package.
let packagePath
try {
  packagePath = require.resolve('@typescript/native/package.json')
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') {
    throw error
  }
  packagePath = require.resolve('typescript/package.json')
}
if (require(packagePath).version !== '7.0.2') {
  throw new Error(
    'This package requires the pinned native TypeScript 7.0.2 compiler'
  )
}
const result = spawnSync(
  process.execPath,
  [join(dirname(packagePath), 'bin', 'tsc'), ...process.argv.slice(2)],
  { stdio: 'inherit' }
)
if (result.error) {
  throw result.error
}
process.exitCode = result.status ?? 1
