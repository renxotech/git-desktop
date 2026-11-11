const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { check, repair } = require('./notification-dependency.cjs')
const receipt = require('../vendor/desktop-notifications/script/build-receipt.cjs')

function put(root, name, value) {
  const target = path.join(root, name)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, value)
}

function snapshot(root) {
  return Object.fromEntries(
    fs
      .readdirSync(root, { recursive: true })
      .sort()
      .flatMap(name => {
        const target = path.join(root, name)
        const stat = fs.lstatSync(target)
        return stat.isSymbolicLink()
          ? [[name, `link:${fs.readlinkSync(target)}`]]
          : stat.isFile()
          ? [
              [
                name,
                createHash('sha256')
                  .update(fs.readFileSync(target))
                  .digest('hex'),
              ],
            ]
          : []
      })
  )
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-qa-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const vendor = path.join(root, 'vendor/desktop-notifications')
  const installed = path.join(root, 'app/node_modules/desktop-notifications')
  for (const [name, value] of Object.entries({
    'package.json': JSON.stringify({ name: 'desktop-notifications' }),
    'binding.gyp': '{}',
    'tsconfig.json': '{}',
    'lib/index.ts': 'export const synthetic = true',
    'src/main.cc': '// synthetic native source',
    'script/build-receipt.cjs': fs.readFileSync(
      path.join(
        __dirname,
        '../vendor/desktop-notifications/script/build-receipt.cjs'
      )
    ),
  }))
    put(vendor, name, value)
  fs.cpSync(vendor, installed, { recursive: true })
  put(installed, 'dist/index.js', '// synthetic compiled JS')
  put(installed, 'dist/index.d.ts', 'export declare const synthetic: true')
  put(
    installed,
    'build/Release/desktop-notifications.node',
    'synthetic: never loaded'
  )
  put(
    installed,
    'build/config.gypi',
    JSON.stringify({ variables: { target_arch: process.arch } })
  )
  receipt.writeReceipt(installed)
  const savedEnv = {
    npm_execpath: process.env.npm_execpath,
    npm_config_arch: process.env.npm_config_arch,
  }
  delete process.env.npm_config_arch
  t.after(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
  return { root, vendor, installed }
}

function lifecycle(root, body) {
  const cli = path.join(root, 'fake-npm.cjs')
  put(
    root,
    'fake-npm.cjs',
    `const fs = require('node:fs'); const path = require('node:path'); const installed = process.argv[process.argv.indexOf('--prefix') + 1]; ${body}`
  )
  process.env.npm_execpath = cli
}

test('matching receipt check is read-only', t => {
  const { root } = fixture(t)
  const before = snapshot(root)
  check(root)
  assert.deepEqual(snapshot(root), before)
})

for (const name of [
  'lib/index.ts',
  'dist/index.js',
  'build/Release/desktop-notifications.node',
]) {
  test(`check rejects changed installed ${name}`, t => {
    const { root, installed } = fixture(t)
    put(installed, name, 'changed')
    assert.throws(() => check(root), /do not match/)
  })
}

test('check rejects changed vendor source and missing compiled declaration', t => {
  const { root, vendor, installed } = fixture(t)
  put(vendor, 'src/main.cc', '// changed')
  assert.throws(() => check(root), /do not match/)
  fs.unlinkSync(path.join(installed, 'dist/index.d.ts'))
  assert.throws(() => check(root))
})

for (const field of ['platform', 'arch']) {
  test(`check rejects mismatched receipt ${field}`, t => {
    const { root, installed } = fixture(t)
    const built = JSON.parse(
      fs.readFileSync(path.join(installed, receipt.receiptName))
    )
    built[field] = 'wrong-target'
    put(installed, receipt.receiptName, JSON.stringify(built))
    assert.throws(() => check(root), /do not match/)
  })
}

test('architecture selection honors explicit npm target', t => {
  const { root, installed } = fixture(t)
  process.env.npm_config_arch = 'synthetic-arch'
  const built = JSON.parse(
    fs.readFileSync(path.join(installed, receipt.receiptName))
  )
  built.arch = 'synthetic-arch'
  put(installed, receipt.receiptName, JSON.stringify(built))
  check(root)
})

test('receipt records native build target rather than requested environment architecture', t => {
  const { root, installed } = fixture(t)
  process.env.npm_config_arch = 'wrong-requested-target'
  receipt.writeReceipt(installed)
  const built = JSON.parse(
    fs.readFileSync(path.join(installed, receipt.receiptName))
  )
  assert.equal(built.arch, process.arch)
  assert.throws(() => check(root), /do not match/)
})

test('repair refreshes only package inputs and requires a new lifecycle receipt', t => {
  const { root, vendor, installed } = fixture(t)
  put(vendor, 'lib/index.ts', '// new input')
  put(root, 'app/node_modules/other-package/keep', 'preserve')
  lifecycle(
    root,
    `require(path.join(installed, 'script/build-receipt.cjs')).writeReceipt(installed)`
  )
  repair(root)
  check(root)
  assert.equal(
    fs.readFileSync(path.join(installed, 'lib/index.ts'), 'utf8'),
    '// new input'
  )
  assert.equal(
    fs.readFileSync(
      path.join(root, 'app/node_modules/other-package/keep'),
      'utf8'
    ),
    'preserve'
  )
})

test('zero-exit skipped lifecycle cannot reuse the old receipt', t => {
  const { root, installed } = fixture(t)
  lifecycle(root, '// skipped install scripts')
  assert.throws(() => repair(root))
  assert.equal(fs.existsSync(path.join(installed, receipt.receiptName)), false)
  assert.throws(() => check(root))
})

test('failed lifecycle leaves dependency explicitly unverified', t => {
  const { root, installed } = fixture(t)
  lifecycle(root, 'process.exit(7)')
  assert.throws(() => repair(root), /rebuild failed/)
  assert.equal(fs.existsSync(path.join(installed, receipt.receiptName)), false)
})

test('repair refuses extra old sources before modifying targets', t => {
  const { root, installed } = fixture(t)
  put(installed, 'src/obsolete.cc', 'preserve')
  lifecycle(root, 'throw new Error("must not execute")')
  const before = snapshot(root)
  assert.throws(() => repair(root), /Obsolete/)
  assert.deepEqual(snapshot(root), before)
})

test('repair without npm invocation refuses without mutation', t => {
  const { root } = fixture(t)
  delete process.env.npm_execpath
  const before = snapshot(root)
  assert.throws(() => repair(root), /Run this repair through npm/)
  assert.deepEqual(snapshot(root), before)
})

for (const relative of ['dist', 'build/Release']) {
  for (const broken of [false, true]) {
    test(`repair rejects ${
      broken ? 'broken' : 'valid'
    } linked ${relative} directory without mutation`, t => {
      const { root, installed } = fixture(t)
      const external = path.join(root, 'external-output')
      put(external, 'keep', 'preserve')
      fs.rmSync(path.join(installed, relative), { recursive: true })
      fs.symlinkSync(external, path.join(installed, relative), 'junction')
      if (broken) fs.rmSync(external, { recursive: true })
      lifecycle(root, 'throw new Error("must not execute")')
      const before = snapshot(root)
      assert.throws(() => repair(root), /Linked/)
      assert.deepEqual(snapshot(root), before)
    })
  }
}

test('repair rejects a linked package and preserves its owner', t => {
  const { root, installed } = fixture(t)
  const owner = path.join(root, 'owning-checkout-package')
  fs.renameSync(installed, owner)
  fs.symlinkSync(owner, installed, 'junction')
  lifecycle(root, 'throw new Error("must not execute")')
  const before = snapshot(root)
  assert.throws(() => repair(root), /shared through a link/)
  assert.deepEqual(snapshot(root), before)
})
