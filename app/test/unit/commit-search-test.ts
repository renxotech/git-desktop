import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GitStore } from '../../src/lib/stores/git-store'
import { git } from '../../src/lib/git/core'
import { setupEmptyRepository } from '../helpers/repositories'
import { shell } from '../helpers/test-app-shell'
import { TestStatsStore } from '../helpers/test-stats-store'

describe('commit message search', () => {
  it('matches literal text in summaries and bodies, ignoring case', async t => {
    const repo = await setupEmptyRepository(t)
    for (const message of [
      'Fix [API].*',
      'Other change\n\nDocument [api].* usage',
      'Fix API',
    ]) {
      await git(
        ['commit', '--allow-empty', '-m', message],
        repo.path,
        'testSetup'
      )
    }
    const store = new GitStore(repo, shell, new TestStatsStore())
    const result = await store.searchCommitBatch('HEAD', '[api].*', 0)
    assert.equal(result?.shas.length, 2)
    assert.equal(result?.hasMore, false)
    assert.equal(
      store.commitLookup.get(result!.shas[0])?.summary,
      'Other change'
    )
    assert.equal(
      store.commitLookup.get(result!.shas[1])?.summary,
      'Fix [API].*'
    )
    assert.deepEqual(await store.searchCommitBatch('HEAD', '--all', 0), {
      shas: [],
      hasMore: false,
    })
  })

  it('paginates matching commits and keeps the original tip after new commits', async t => {
    const repo = await setupEmptyRepository(t)
    // Build a long history efficiently without touching the working tree/index.
    const tree = await git(['mktree'], repo.path, 'testSetup', { stdin: '' })
    let tip: string | undefined
    for (let i = 0; i < 106; i++) {
      const result = await git(
        [
          'commit-tree',
          tree.stdout.trim(),
          ...(tip ? ['-p', tip] : []),
          '-m',
          i === 50 ? 'Unrelated' : `Needle ${i}`,
        ],
        repo.path,
        'testSetup'
      )
      tip = result.stdout.trim()
    }
    await git(['update-ref', 'HEAD', tip!], repo.path, 'testSetup')
    const store = new GitStore(repo, shell, new TestStatsStore())
    const first = await store.searchCommitBatch(tip!, 'needle', 0)
    assert.equal(first?.shas.length, 100)
    assert.equal(first?.hasMore, true)
    await git(
      ['commit', '--allow-empty', '-m', 'Needle newer'],
      repo.path,
      'testSetup'
    )
    const second = await store.searchCommitBatch(tip!, 'needle', 100)
    assert.equal(second?.shas.length, 5)
    assert.equal(second?.hasMore, false)
    assert.equal(new Set([...first!.shas, ...second!.shas]).size, 105)
    assert.equal(store.commitLookup.get(second!.shas[4])?.summary, 'Needle 0')
  })

  it('returns an empty result for an unborn branch', async t => {
    const repo = await setupEmptyRepository(t)
    const store = new GitStore(repo, shell, new TestStatsStore())
    assert.deepEqual(await store.searchCommitBatch('HEAD', 'needle', 0), {
      shas: [],
      hasMore: false,
    })
  })
})
