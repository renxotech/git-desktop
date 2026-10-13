// Windows packaged-app regression: complete Welcome without signing in, add a
// local repository, close through the title bar, and reopen the same profile.
// Optionally repeat with a read-only copy of an existing profile.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

const run = promisify(execFile)
if (process.platform !== 'win32') {
  throw new Error('The packaged profile restart check requires Windows')
}
const root = resolve(import.meta.dirname, '..')
const qa = await mkdtemp(join(tmpdir(), 'git-desktop-profile-restart-'))
const powershell = join(
  process.env.SystemRoot,
  'System32/WindowsPowerShell/v1.0/powershell.exe'
)
const launcher = join(root, 'script/start-test.ps1')
const sourceIndex = process.argv.indexOf('--source-profile')
const sourceProfile =
  sourceIndex === -1 ? undefined : process.argv[sourceIndex + 1]
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: join(qa, 'gitconfig'),
  GIT_CONFIG_SYSTEM: join(qa, 'gitconfig-system'),
}
delete env.ELECTRON_RUN_AS_NODE

async function freePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const repositories = await new Promise((resolve, reject) => {
      const request = indexedDB.open('Database')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const count = db
          .transaction('repositories', 'readonly')
          .objectStore('repositories')
          .count()
        count.onerror = () => reject(count.error)
        count.onsuccess = () => {
          resolve(count.result)
          db.close()
        }
      }
    })
    return {
      welcome: localStorage.getItem('has-shown-welcome-flow'),
      users: JSON.parse(localStorage.getItem('users') ?? '[]').length,
      repositories,
      profile: await require('electron').ipcRenderer.invoke(
        'get-path',
        'userData'
      ),
    }
  })
}

async function launchAndClose(profile, name, action) {
  const port = await freePort()
  await run(
    powershell,
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      launcher,
      '-UserDataDirectory',
      profile,
      '-RemoteDebuggingPort',
      String(port),
    ],
    { cwd: root, env, windowsHide: true }
  )
  let browser
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
      break
    } catch {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  assert.ok(browser, 'Launcher must expose the QA browser within 20 seconds')
  const page = browser.contexts()[0].pages()[0]
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.locator('#desktop-app-chrome').waitFor({ timeout: 30000 })
    if (action) await action(page)
    assert.equal(
      await page.locator('#welcome').count(),
      0,
      'Welcome must stay completed'
    )
    await page.locator('#desktop-app-toolbar').waitFor({ timeout: 30000 })
    const result = await snapshot(page)
    assert.equal(result.profile.toLowerCase(), profile.toLowerCase())
    assert.equal(result.welcome, '1')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: join(qa, `${name}.png`) })
    // This is the same X button the user clicks; do not substitute app.quit().
    const closed = once(browser, 'disconnected', {
      signal: AbortSignal.timeout(20000),
    })
    await page.locator('#desktop-app-title-bar .window-control.close').click()
    await closed
    console.log(JSON.stringify({ name, ...result }))
    return result
  } catch (error) {
    await page
      .screenshot({ path: join(qa, `${name}-failure.png`) })
      .catch(() => {})
    await page
      .locator('#desktop-app-title-bar .window-control.close')
      .click()
      .catch(() => {})
    throw error
  }
}

const fresh = join(qa, 'fresh')
const repository = join(qa, 'restart-fixture')
await mkdir(fresh)
await mkdir(repository)
await run('git', ['init', repository], { env, windowsHide: true })
await run(
  'git',
  [
    '-C',
    repository,
    '-c',
    'user.name=Restart QA',
    '-c',
    'user.email=restart-qa@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'Fixture',
  ],
  { env, windowsHide: true }
)
const initial = await launchAndClose(fresh, 'fresh-first', async page => {
  await page.getByText('Continue without signing in', { exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Restart QA')
  await page
    .getByLabel('Email', { exact: true })
    .fill('restart-qa@example.invalid')
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.locator('#welcome').waitFor({ state: 'hidden' })
  await page
    .getByRole('button', {
      name: /Add an Existing Repository from your local drive/,
    })
    .click()
  await page.getByLabel('Local path', { exact: true }).fill(repository)
  await page
    .getByRole('button', { name: 'Add repository', exact: true })
    .click()
  await page
    .locator('dialog#add-existing-repository')
    .waitFor({ state: 'hidden' })
  await page.getByText('restart-fixture', { exact: true }).first().waitFor()
})
assert.equal(initial.repositories, 1)
const reopened = await launchAndClose(fresh, 'fresh-reopened')
assert.deepEqual(reopened, initial)

if (sourceProfile) {
  const copied = join(qa, 'copied')
  await cp(sourceProfile, copied, { recursive: true })
  const first = await launchAndClose(copied, 'copied-first')
  assert.ok(first.repositories > 0, 'Copied profile must include repositories')
  const second = await launchAndClose(copied, 'copied-reopened')
  assert.deepEqual(second, first)
}
await writeFile(
  join(qa, 'result.json'),
  JSON.stringify({ passed: true, initial, reopened }, null, 2)
)
console.log(`Restart checks passed. Evidence: ${qa}`)
