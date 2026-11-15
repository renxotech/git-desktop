import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { it } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const toolingRoot = resolve(import.meta.dirname, '../..')
const npmCli = process.env.npm_execpath ?? ''
assert.ok(npmCli, 'Run release tooling tests through npm')

/** @param {string} path */
async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

/**
 * @param {string} root
 * @param {string[]} args
 */
async function git(root, args) {
  return execFileAsync(
    'git',
    [
      '-c',
      'core.hooksPath=.unused-hooks',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd: root }
  )
}

/**
 * Old release targets deliberately have neither node_modules nor release tools.
 *
 * @param {import('node:test').TestContext} t
 * @param {boolean} lockfile
 */
async function fixture(t, lockfile = true) {
  const root = await mkdtemp(join(tmpdir(), 'desktop release-ci-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'app'))
  await writeFile(
    join(root, 'app/package.json'),
    JSON.stringify({
      name: 'release-target-fixture',
      version: '1.2.3-beta1',
      private: true,
      scripts: {
        preversion:
          "node -e \"require('fs').writeFileSync('hook-ran', 'unexpected')\"",
      },
    })
  )
  if (lockfile) {
    await writeFile(
      join(root, 'app/package-lock.json'),
      JSON.stringify({
        name: 'release-target-fixture',
        version: '1.2.3-beta1',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': { name: 'release-target-fixture', version: '1.2.3-beta1' },
        },
      })
    )
  }
  await writeFile(
    join(root, 'changelog.json'),
    JSON.stringify({
      releases: {
        '1.2.3-beta1': [
          '[Fixed] Target-only release entry',
          'Ignore this note',
        ],
        '1.2.3-beta0': ['[Fixed] Skip beta0'],
        '1.2.2': ['[Fixed] Previous release'],
      },
    })
  )
  await git(root, ['init', '--initial-branch=main'])
  await git(root, ['config', 'user.name', 'Release fixture'])
  await git(root, ['config', 'user.email', 'fixture@example.invalid'])
  await git(root, ['add', 'app', 'changelog.json'])
  await git(root, ['commit', '-m', 'Old release source'])
  await git(root, ['tag', 'release-1.2.2'])
  await git(root, ['tag', 'release-1.2.3-beta1'])
  return root
}

/**
 * Exercise the workflow's npm entry point from a plain parent process.
 *
 * @param {string} root
 * @param {string[]} args
 */
async function invoke(root, args) {
  /** @type {Record<string, string | undefined>} */
  const env = {
    ...process.env,
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
  }
  for (const name of Object.keys(env)) {
    if (/^npm_(execpath|command|lifecycle_event)$/i.test(name)) {
      delete env[name]
    }
  }
  return execFileAsync(
    process.execPath,
    [
      npmCli,
      '--prefix',
      toolingRoot,
      'run',
      '--silent',
      'draft-release:ci',
      '--',
      root,
      ...args,
    ],
    { cwd: root, env, timeout: 120_000 }
  )
}

it('reads beta and production dry-run data from the release target without mutation', async t => {
  const root = await fixture(t)
  const originalApp = await readFile(join(root, 'app/package.json'), 'utf8')
  const originalChangelog = await readFile(join(root, 'changelog.json'), 'utf8')
  const beta = await invoke(root, ['version', 'beta'])
  assert.match(beta.stdout, /previous=1\.2\.3-beta1/)
  assert.match(beta.stdout, /next=1\.2\.3-beta2/)
  assert.match(beta.stdout, /compare-base=1\.2\.3-beta1/)
  const production = await invoke(root, ['version', 'production'])
  assert.match(production.stdout, /previous=1\.2\.2/)
  assert.match(production.stdout, /next=1\.2\.3(?:\r?\n|$)/)
  assert.match(production.stdout, /latest-beta=1\.2\.3-beta1/)
  const entries = await invoke(root, ['changelog-entries', '1.2.2'])
  assert.deepEqual(JSON.parse(entries.stdout), [
    '[Fixed] Target-only release entry',
  ])
  assert.equal(
    await readFile(join(root, 'app/package.json'), 'utf8'),
    originalApp
  )
  assert.equal(
    await readFile(join(root, 'changelog.json'), 'utf8'),
    originalChangelog
  )
  assert.equal((await git(root, ['status', '--porcelain'])).stdout, '')
})

it('prepares a beta from a plain process without inherited npm context', async t => {
  const root = await fixture(t)
  const toolApp = await readFile(join(toolingRoot, 'app/package.json'), 'utf8')
  const toolChangelog = await readFile(
    join(toolingRoot, 'changelog.json'),
    'utf8'
  )
  const entries = ['[Fixed] Beta fixture with "quotes" and $literal text']
  await invoke(root, ['prepare', '1.2.3-beta2', JSON.stringify(entries)])
  assert.equal(
    (await readJson(join(root, 'app/package.json'))).version,
    '1.2.3-beta2'
  )
  const lock = await readJson(join(root, 'app/package-lock.json'))
  assert.equal(lock.version, '1.2.3-beta2')
  assert.equal(lock.packages[''].version, '1.2.3-beta2')
  assert.deepEqual(
    (await readJson(join(root, 'changelog.json'))).releases['1.2.3-beta2'],
    entries
  )
  await assert.rejects(access(join(root, 'app/hook-ran')), { code: 'ENOENT' })
  assert.equal(
    await readFile(join(toolingRoot, 'app/package.json'), 'utf8'),
    toolApp
  )
  assert.equal(
    await readFile(join(toolingRoot, 'changelog.json'), 'utf8'),
    toolChangelog
  )
})

it('prepares production after checking out a beta that removes the new runner', async t => {
  const root = await fixture(t)
  await mkdir(join(root, 'script'))
  await writeFile(
    join(root, 'script/checked-run.mjs'),
    'throw new Error("fixture runner")'
  )
  await git(root, ['add', 'script'])
  await git(root, ['commit', '-m', 'New tooling marker'])
  await git(root, ['checkout', '-b', 'releases/1.2.3', 'release-1.2.3-beta1'])
  await assert.rejects(access(join(root, 'script/checked-run.mjs')), {
    code: 'ENOENT',
  })
  await assert.rejects(access(join(root, 'node_modules')), { code: 'ENOENT' })
  await invoke(root, ['prepare', '1.2.3', '["[Fixed] Production fixture"]'])
  assert.equal(
    (await readJson(join(root, 'app/package.json'))).version,
    '1.2.3'
  )
  assert.equal(
    (await readJson(join(root, 'app/package-lock.json'))).version,
    '1.2.3'
  )
  assert.deepEqual(
    (await readJson(join(root, 'changelog.json'))).releases['1.2.3'],
    ['[Fixed] Production fixture']
  )
  assert.equal(
    (await git(root, ['tag', '--list'])).stdout.trim().split(/\r?\n/).length,
    2
  )
})

it('supports an explicit old hotfix target without tooling or an npm lockfile', async t => {
  const root = await fixture(t, false)
  await git(root, ['checkout', '--detach', 'release-1.2.2'])
  await assert.rejects(access(join(root, 'script')), { code: 'ENOENT' })
  const before = await git(root, ['rev-parse', 'HEAD'])
  const versions = await invoke(root, ['version', 'production'])
  assert.match(versions.stdout, /next=1\.2\.3(?:\r?\n|$)/)
  await invoke(root, ['prepare', '1.2.3', '["[Fixed] Old hotfix"]'])
  assert.equal(
    (await readJson(join(root, 'app/package.json'))).version,
    '1.2.3'
  )
  assert.deepEqual(
    (await readJson(join(root, 'changelog.json'))).releases['1.2.3'],
    ['[Fixed] Old hotfix']
  )
  assert.equal((await git(root, ['rev-parse', 'HEAD'])).stdout, before.stdout)
  await assert.rejects(access(join(root, 'app/hook-ran')), { code: 'ENOENT' })
  await assert.rejects(access(join(root, 'app/package-lock.json')), {
    code: 'ENOENT',
  })
})

it('keeps release tooling independent of target refs and excludes writes in dry-run mode', async () => {
  const workflow = await readFile(
    join(toolingRoot, '.github/workflows/draft-release.yml'),
    'utf8'
  )
  const toolingCheckout = workflow.split('- name: Checkout release tooling')[1]
  assert.ok(toolingCheckout)
  assert.match(toolingCheckout, /ref: \$\{\{ github\.workflow_sha \}\}/)
  assert.match(toolingCheckout, /path: \.release-tooling/)
  assert.match(workflow, /node-version-file: ['"]?\.release-tooling\/\.nvmrc/)
  assert.match(
    workflow,
    /name: Install dependencies\s+working-directory: \.release-tooling\s+run: npm ci/
  )
  assert.equal(
    workflow.match(
      /npm --prefix \.release-tooling run --silent draft-release:ci --/g
    )?.length,
    3
  )
  assert.equal(
    workflow.match(/"\$GITHUB_WORKSPACE" (version|changelog-entries|prepare)/g)
      ?.length,
    3
  )
  const createRelease = workflow.split(
    '- name: Create release branch and commit'
  )[1]
  assert.ok(createRelease)
  assert.match(createRelease, /^\s+if: \$\{\{ inputs\.dry-run == false \}\}/)
  assert.match(
    createRelease,
    /\.release-tooling\/node_modules\/\.bin\/prettier --write changelog\.json/
  )
  assert.match(createRelease, /git add app\/package\.json changelog\.json/)
  assert.doesNotMatch(createRelease, /git add (?:\.|--all|-A)(?:\s|$)/)
})
