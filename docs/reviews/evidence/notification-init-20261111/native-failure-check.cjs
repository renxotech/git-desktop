const assert = require('node:assert/strict')
const path = require('node:path')
const addon = require(path.resolve('vendor/desktop-notifications/build/Release/desktop-notifications.node'))
const options = {toastActivatorClsid:'{27D44D0C-A542-5B90-BCDB-AC3126048BA2}'}
async function main() {
  addon.terminateNotifications()
  assert.equal(await addon.getNotificationsPermission(), 'default')
  assert.equal(addon.initializeNotifications(() => {}, options), false)
  assert.equal(await addon.getNotificationsPermission(), 'default')
  assert.equal(addon.initializeNotifications(() => {}, options), false)
  addon.terminateNotifications()
  addon.terminateNotifications()
  assert.equal(await addon.getNotificationsPermission(), 'default')
  console.log('PASS native missing-AUMID false/retry/default/teardown contract')
}
main().catch(error => {console.error(error);process.exitCode=1})
