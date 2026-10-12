import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import childProcess from 'node:child_process'
import * as Path from 'path'
import { AppStore } from '../../src/lib/stores/app-store'
import { Repository } from '../../src/models/repository'
import { git } from '../../src/lib/git/core'
import { inspectHealthRepository } from '../../src/lib/repository-health'
import { setupEmptyRepository } from '../helpers/repositories'
import { createTempDirectory } from '../helpers/temp'

function createHealthStore(repositories: ReadonlyArray<Repository>) {
  const updates: boolean[] = []
  return {
    repositories,
    updates,
    repositoryStateCache: {
      get: () => ({
        isPushPullFetchInProgress: false,
        isCommitting: false,
        checkoutProgress: null,
      }),
      update: (
        _repository: Repository,
        change: () => { isPushPullFetchInProgress: boolean }
      ) => updates.push(change().isPushPullFetchInProgress),
    },
    emitUpdate: () => {},
    _refreshRepository: async () => {},
  }
}

describe('repository health locking', () => {
  it('limits Git subprocesses during identity discovery even when only one repository is selected', async t => {
    const repositories = await Promise.all(
      Array.from({ length: 24 }, () => setupEmptyRepository(t))
    )
    const selected = await inspectHealthRepository(repositories[0].path)
    const fake = createHealthStore(repositories)
    const originalExecFile = childProcess.execFile
    let active = 0
    let peak = 0
    t.mock.method(
      childProcess,
      'execFile',
      (...args: Parameters<typeof originalExecFile>) => {
        const child = Reflect.apply(
          originalExecFile,
          childProcess,
          args
        ) as ReturnType<typeof originalExecFile>
        peak = Math.max(peak, ++active)
        child.once('close', () => active--)
        return child
      }
    )
    let results = 0
    await AppStore.prototype._performRepositoryHealthOperation.call(
      fake as unknown as AppStore,
      [selected],
      'fetch',
      new AbortController().signal,
      result => {
        assert.deepEqual(result.errors, [])
        results++
      }
    )
    assert.ok(peak > 0)
    assert.ok(peak <= 4, `Started ${peak} Git subprocesses at once`)
    assert.equal(active, 0)
    assert.equal(results, 1)
  })

  it('stops queued identity lookups on cancellation without acquiring locks or starting Health operations', async t => {
    const repositories = await Promise.all(
      Array.from({ length: 24 }, () => setupEmptyRepository(t))
    )
    const selected = await inspectHealthRepository(repositories[0].path)
    const fake = createHealthStore(repositories)
    const controller = new AbortController()
    const originalExecFile = childProcess.execFile
    const execFile = t.mock.method(
      childProcess,
      'execFile',
      (...args: Parameters<typeof originalExecFile>) => {
        controller.abort()
        return Reflect.apply(
          originalExecFile,
          childProcess,
          args
        ) as ReturnType<typeof originalExecFile>
      }
    )
    await AppStore.prototype._performRepositoryHealthOperation.call(
      fake as unknown as AppStore,
      [selected],
      'fetch',
      controller.signal,
      () => assert.fail('Cancelled discovery must not start a Health operation')
    )
    // At most four already-started identities, each with two Git commands.
    assert.ok(execFile.mock.callCount() > 0)
    assert.ok(execFile.mock.callCount() <= 8)
    assert.deepEqual(fake.updates, [])
  })

  it('does not inspect registered repositories when the signal is already aborted', async t => {
    const controller = new AbortController()
    controller.abort()
    const execFile = t.mock.method(childProcess, 'execFile', () => {
      assert.fail('An already cancelled operation must not launch Git')
    })
    const fake = createHealthStore([
      new Repository(
        Path.resolve('cancelled-health-repository'),
        1,
        null,
        false
      ),
    ])
    await AppStore.prototype._performRepositoryHealthOperation.call(
      fake as unknown as AppStore,
      [],
      'fetch',
      controller.signal,
      () =>
        assert.fail('An already cancelled operation must not report results')
    )
    assert.equal(execFile.mock.callCount(), 0)
    assert.deepEqual(fake.updates, [])
  })

  it('locks selected Git identities including linked checkouts, leaving unrelated busy repositories alone', async t => {
    const selected = await setupEmptyRepository(t)
    const unrelated = await setupEmptyRepository(t)
    await git(
      ['commit', '--allow-empty', '-m', 'base'],
      selected.path,
      'healthLockTest'
    )
    const linkedPath = Path.join(await createTempDirectory(t), 'linked')
    await git(
      ['worktree', 'add', '-b', 'linked', linkedPath],
      selected.path,
      'healthLockTest'
    )
    const linked = new Repository(linkedPath, 9999, null, false)
    const busy = new Map([
      [selected.path, false],
      [linked.path, false],
      [unrelated.path, true],
    ])
    const fake = {
      repositories: [selected, linked, unrelated],
      repositoryStateCache: {
        get: (repository: Repository) => ({
          isPushPullFetchInProgress: busy.get(repository.path),
          isCommitting: false,
          checkoutProgress: null,
        }),
        update: (
          repository: Repository,
          change: () => { isPushPullFetchInProgress: boolean }
        ) => {
          busy.set(repository.path, change().isPushPullFetchInProgress)
        },
      },
      emitUpdate: () => {},
      _refreshRepository: async () => {},
    }
    let results = 0
    await AppStore.prototype._performRepositoryHealthOperation.call(
      fake as unknown as AppStore,
      [await inspectHealthRepository(selected.path)],
      'fetch',
      new AbortController().signal,
      result => {
        results++
        assert.deepEqual(result.errors, [])
        assert.equal(busy.get(selected.path), true)
        assert.equal(busy.get(linked.path), true)
        assert.equal(busy.get(unrelated.path), true)
      }
    )
    assert.equal(results, 1)
    assert.equal(busy.get(selected.path), false)
    assert.equal(busy.get(linked.path), false)
    assert.equal(busy.get(unrelated.path), true)
  })
})
