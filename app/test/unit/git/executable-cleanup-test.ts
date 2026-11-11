import assert from 'node:assert/strict'
import { afterEach, before, describe, it, mock } from 'node:test'
import * as FileSystem from 'fs/promises'
import { join } from 'path'

let executable: typeof import('../../../src/lib/git/executable')
let gitPath: string
let cleanupError: Error | undefined
let poisonRepository = false
const directories: string[] = []
const cleanupCalls: Parameters<typeof FileSystem.rm>[] = []
const remove = FileSystem.rm
const makeDirectory = FileSystem.mkdtemp

before(async () => {
  mock.module('fs/promises', {
    namedExports: {
      ...FileSystem,
      mkdtemp: async (prefix: string) => {
        const directory = await makeDirectory(prefix)
        directories.push(directory)
        if (poisonRepository) {
          await FileSystem.writeFile(join(directory, '.git'), 'invalid gitfile')
        }
        return directory
      },
      rm: async (...args: Parameters<typeof FileSystem.rm>) => {
        cleanupCalls.push(args)
        if (cleanupError !== undefined) {
          throw cleanupError
        }
        await remove(...args)
      },
    },
  })
  executable = await import('../../../src/lib/git/executable')
  const path = await executable.discoverInstalledGit()
  assert.ok(path, 'An installed Git is required for local compatibility probes')
  gitPath = path
})

afterEach(async () => {
  cleanupError = undefined
  poisonRepository = false
  cleanupCalls.length = 0
  localStorage.removeItem('git-executable-selection')
  await Promise.all(
    directories.splice(0).map(directory =>
      remove(directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      })
    )
  )
})

describe('Git executable validation cleanup', () => {
  it('removes its disposable repository quietly with bounded Windows retries', async t => {
    const warning = t.mock.method(log, 'warn')
    const result = await executable.validateGitExecutable({
      kind: 'installed',
      path: gitPath,
    })
    assert.equal(result.path, gitPath)
    assert.deepEqual(cleanupCalls, [
      [
        directories[0],
        { recursive: true, force: true, maxRetries: 3, retryDelay: 100 },
      ],
    ])
    await assert.rejects(FileSystem.access(directories[0]), { code: 'ENOENT' })
    assert.equal(warning.mock.callCount(), 0)
  })

  it('returns a usable Git and warns when removing the directory remains busy', async t => {
    const warning = t.mock.method(log, 'warn')
    cleanupError = Object.assign(new Error('validation directory is busy'), {
      code: 'EBUSY',
    })
    const result = await executable.validateGitExecutable({
      kind: 'installed',
      path: gitPath,
    })
    assert.equal(result.path, gitPath)
    assert.equal(
      executable.isSupportedGitVersion(`git version ${result.version}`),
      true
    )
    assert.equal(warning.mock.callCount(), 1)
    const [message, error] = warning.mock.calls[0].arguments
    assert.ok(message.includes(directories[0]))
    assert.equal(error, cleanupError)
    assert.equal(cleanupCalls.length, 1)
  })

  it('preserves a real Git compatibility error when cleanup also fails', async t => {
    const warning = t.mock.method(log, 'warn')
    cleanupError = Object.assign(new Error('validation directory is busy'), {
      code: 'EBUSY',
    })
    poisonRepository = true
    await assert.rejects(
      executable.validateGitExecutable({ kind: 'installed', path: gitPath }),
      error => {
        assert.ok(error instanceof Error)
        assert.notEqual(error, cleanupError)
        assert.match(error.message, /invalid gitfile format/i)
        return true
      }
    )
    assert.equal(warning.mock.callCount(), 1)
    assert.equal(warning.mock.calls[0].arguments[1], cleanupError)
    assert.equal(cleanupCalls.length, 1)
  })

  it('caches a usable session after cleanup failure without switching Git', async t => {
    t.mock.method(log, 'warn')
    cleanupError = Object.assign(new Error('validation directory is busy'), {
      code: 'EBUSY',
    })
    executable.saveGitExecutableSelection({ kind: 'installed', path: gitPath })
    const first = executable.getGitExecutable()
    const selected = await first
    executable.saveGitExecutableSelection({ kind: 'bundled' })
    assert.equal(executable.getGitExecutable(), first)
    assert.equal(await executable.getGitExecutable(), selected)
    assert.deepEqual(selected.selection, { kind: 'installed', path: gitPath })
    assert.equal(cleanupCalls.length, 1)
  })
})
