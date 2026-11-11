const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const crypto = require('node:crypto')
const source = fs.readFileSync(path.resolve('vendor/desktop-notifications/dist/native-module.js'), 'utf8')
function setup(options = {}) {
  const { supported = true, platform = 'win32' } = options
  const initResult = Object.hasOwn(options, 'initResult') ? options.initResult : true
  const calls = []
  const native = {
    initializeNotifications: (...args) => { calls.push(['init', ...args]); return initResult },
    terminateNotifications: () => calls.push(['terminate']),
    getNotificationsPermission: async () => { calls.push(['permission']); return 'granted' },
    requestNotificationsPermission: async () => { calls.push(['request']); return true },
    showNotification: async (...args) => { calls.push(['show', ...args]) },
    closeNotification: (...args) => calls.push(['close', ...args]),
  }
  let loads = 0
  const exports = {}
  vm.runInNewContext(source, { exports, crypto, process: { platform }, require: name => {
    if (name === './notification-support') return { supportsNotifications: () => supported }
    if (name === './notification-callback') return { notificationCallback() {} }
    if (name.endsWith('.node')) { loads++; return native }
    throw Error(`Unexpected import ${name}`)
  } }, { filename: 'native-module.js' })
  return { api: exports, calls, native, loads: () => loads }
}
async function main() {
  let count = 0
  const check = async (label, fn) => { await fn(); count++; console.log(`PASS ${label}`) }
  await check('pre-init functions safely default without loading native addon', async () => {
    const { api, calls, loads } = setup()
    assert.equal(await api.showNotification('T','B'), null)
    assert.equal(await api.getNotificationsPermission(), 'default')
    assert.equal(await api.requestNotificationsPermission(), false)
    api.closeNotification('x'); api.terminateNotifications()
    assert.equal(loads(), 0); assert.equal(calls.length, 0)
  })
  await check('unsupported platform cannot initialize or report submission', async () => {
    const { api, loads } = setup({ supported: false })
    assert.equal(api.initializeNotifications({}), false)
    assert.equal(await api.showNotification('T','B'), null)
    assert.equal(loads(), 0)
  })
  await check('failed native init remains unavailable and does not terminate uninitialized addon', async () => {
    const { api, calls } = setup({ initResult: false })
    assert.equal(api.initializeNotifications({}), false)
    assert.equal(await api.showNotification('T','B'), null)
    assert.equal(await api.getNotificationsPermission(), 'default')
    assert.equal(await api.requestNotificationsPermission(), false)
    api.closeNotification('x'); api.terminateNotifications()
    assert.deepEqual(calls.map(x => x[0]), ['init'])
  })
  await check('failed init can retry and become ready', async () => {
    const { api, native, calls } = setup({ initResult: false })
    assert.equal(api.initializeNotifications({}), false)
    native.initializeNotifications = () => { calls.push(['init-retry']); return true }
    assert.equal(api.initializeNotifications({}), true)
    assert.equal(await api.getNotificationsPermission(), 'granted')
  })
  await check('successful init is idempotent and delegates valid native operations', async () => {
    const { api, calls } = setup()
    assert.equal(api.initializeNotifications({toastActivatorClsid:'test'}), true)
    assert.equal(api.initializeNotifications({}), true)
    assert.equal(await api.getNotificationsPermission(), 'granted')
    assert.equal(await api.requestNotificationsPermission(), true)
    const id = await api.showNotification('T','B',{test:1})
    assert.match(id, /^[\da-f-]{36}$/i)
    api.closeNotification(id)
    assert.deepEqual(calls.map(x => x[0]), ['init','permission','request','show','close'])
    assert.equal(calls[3][1], id)
  })
  await check('submission rejection maps to null', async () => {
    const { api, native } = setup(); api.initializeNotifications({})
    native.showNotification = async () => { throw Error('submission failed') }
    assert.equal(await api.showNotification('T','B'), null)
  })
  await check('termination resets readiness and is idempotent', async () => {
    const { api, calls } = setup(); api.initializeNotifications({}); api.terminateNotifications(); api.terminateNotifications()
    assert.equal(await api.showNotification('T','B'), null)
    assert.equal(await api.getNotificationsPermission(), 'default')
    assert.deepEqual(calls.map(x => x[0]), ['init','terminate'])
    assert.equal(api.initializeNotifications({}), true)
  })
  await check('macOS void initialization compatibility preserved', async () => {
    const { api } = setup({ initResult: undefined, platform: 'darwin' }); assert.equal(api.initializeNotifications({}), true)
  })
  await check('Windows stale void addon cannot claim initialized', async () => {
    const { api } = setup({ initResult: undefined, platform: 'win32' })
    assert.equal(api.initializeNotifications({}), false)
    assert.equal(await api.showNotification('T','B'), null)
  })
  console.log(`${count} process-side wrapper checks passed`)
}
main().catch(error => {console.error(error);process.exitCode=1})
