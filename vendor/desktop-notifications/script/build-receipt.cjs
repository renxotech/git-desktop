const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

const receiptName = '.desktop-build-receipt.json'

function files(root, relative) {
  const target = path.join(root, relative)
  const stat = fs.lstatSync(target)
  if (stat.isSymbolicLink()) {
    throw new Error(`Linked notification input is unsupported: ${target}`)
  }
  return stat.isDirectory()
    ? fs.readdirSync(target).flatMap(name => files(root, `${relative}/${name}`))
    : [relative]
}

function inputs(root) {
  return [
    'package.json',
    'binding.gyp',
    'tsconfig.json',
    'lib',
    'src',
    'script',
  ]
    .flatMap(relative => files(root, relative))
    .sort()
}

function hashes(root, names) {
  return Object.fromEntries(
    names.map(name => [
      name,
      createHash('sha256')
        .update(fs.readFileSync(path.join(root, name)))
        .digest('hex'),
    ])
  )
}

function artifacts(root) {
  return [
    ...files(root, 'lib').flatMap(name => {
      if (!name.endsWith('.ts')) {
        return []
      }
      const base = name.replace(/^lib\//, 'dist/').slice(0, -3)
      return [`${base}.js`, `${base}.d.ts`]
    }),
    'build/Release/desktop-notifications.node',
  ].sort()
}

function writeReceipt(root) {
  const config = JSON.parse(
    fs
      .readFileSync(path.join(root, 'build/config.gypi'), 'utf8')
      .replace(/^#.*\r?\n/, '')
  )
  const receipt = {
    platform: process.platform,
    arch: config.variables.target_arch,
    inputs: hashes(root, inputs(root)),
    artifacts: hashes(root, artifacts(root)),
  }
  fs.writeFileSync(
    path.join(root, receiptName),
    JSON.stringify(receipt, null, 2)
  )
}

module.exports = { receiptName, files, inputs, hashes, artifacts, writeReceipt }

if (require.main === module) {
  writeReceipt(path.resolve(__dirname, '..'))
}
