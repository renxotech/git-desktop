import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { writeFile, unlink, rename, stat, symlink } from 'fs/promises'
import { join } from 'path'
import { exec } from 'dugite'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import {
  loadFileInventory,
  loadFileRevisions,
  readCurrentSnapshot,
  readFileSnapshot,
  buildHistoryTree,
} from '../../../src/lib/git/file-history'
import { getFileSnapshotDiff } from '../../../src/lib/git/diff'
import { DiffType } from '../../../src/models/diff'

describe('file history explorer data', () => {
  it('excludes untracked paths but retains index additions and staged deletions', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, { entries: [{ path: 'old.txt', contents: 'old' }] })
    await writeFile(join(repo.path, 'untracked.txt'), 'untracked')
    await writeFile(join(repo.path, 'new.txt'), 'new')
    await exec(['add', 'new.txt'], repo.path)
    await exec(['rm', 'old.txt'], repo.path)
    const result = await loadFileInventory(repo)
    assert.deepEqual(result.paths, ['new.txt', 'old.txt'])
    assert.ok(result.dirty.has('new.txt'))
    assert.ok(result.dirty.has('old.txt'))
  })

  it('supports newly staged files before the first commit', async t => {
    const repo = await setupEmptyRepository(t)
    await writeFile(join(repo.path, 'new.txt'), 'first')
    await writeFile(join(repo.path, 'hidden.txt'), 'untracked')
    await exec(['add', 'new.txt'], repo.path)
    const inventory = await loadFileInventory(repo)
    assert.equal(inventory.head, null)
    assert.deepEqual(inventory.paths, ['new.txt'])
    assert.ok(inventory.dirty.has('new.txt'))
    assert.deepEqual(await loadFileRevisions(repo, null, 'new.txt', 100), [])
  })

  it('uses on-disk contents and mtime despite distinct staged contents', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'original' }],
    })
    await writeFile(join(repo.path, 'file.txt'), 'staged')
    await exec(['add', 'file.txt'], repo.path)
    await writeFile(join(repo.path, 'file.txt'), 'disk')
    const current = await readCurrentSnapshot(repo, 'file.txt')
    assert.equal(current.contents?.toString(), 'disk')
    assert.equal(
      current.modified,
      (await stat(join(repo.path, 'file.txt'))).mtimeMs
    )
    await writeFile(join(repo.path, 'file.txt'), 'original')
    assert.ok((await loadFileInventory(repo)).dirty.has('file.txt'))
    assert.equal(
      (await readCurrentSnapshot(repo, 'file.txt')).contents?.toString(),
      'original'
    )
  })

  it('represents deletion separately from an empty file without a fabricated date', async t => {
    const repo = await setupEmptyRepository(t)
    await writeFile(join(repo.path, 'empty.txt'), '')
    const empty = await readCurrentSnapshot(repo, 'empty.txt')
    assert.equal(empty.contents?.length, 0)
    await unlink(join(repo.path, 'empty.txt'))
    const absent = await readCurrentSnapshot(repo, 'empty.txt')
    assert.equal(absent.contents, null)
    assert.equal(absent.modified, undefined)
    assert.equal(absent.mode, 'absent')
  })

  it('rejects traversal and absolute paths', async t => {
    const repo = await setupEmptyRepository(t)
    for (const path of ['../outside', 'a/../../outside', repo.path]) {
      await assert.rejects(readCurrentSnapshot(repo, path), /outside/)
    }
  })

  it('rejects an intermediate junction escape', async t => {
    const repo = await setupEmptyRepository(t)
    const other = await setupEmptyRepository(t)
    await writeFile(join(other.path, 'secret.txt'), 'outside')
    await symlink(other.path, join(repo.path, 'escape'), 'junction')
    await assert.rejects(
      readCurrentSnapshot(repo, 'escape/secret.txt'),
      /outside/
    )
    await assert.rejects(
      readCurrentSnapshot(repo, 'escape/deleted.txt'),
      /outside/
    )
  })

  it('reads literal bracket paths and follows committed renames across a larger history page', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [{ path: '[old].txt', contents: 'one\n' }],
      commitMessage: 'first\n\nBody text',
    })
    await rename(join(repo.path, '[old].txt'), join(repo.path, '[new].txt'))
    await exec(['add', '-A'], repo.path)
    await exec(['commit', '-m', 'rename'], repo.path)
    await makeCommit(repo, {
      entries: [{ path: '[new].txt', contents: 'two\n' }],
      commitMessage: 'third',
    })
    const inventory = await loadFileInventory(repo)
    const firstPage = await loadFileRevisions(
      repo,
      inventory.head,
      '[new].txt',
      1
    )
    const fullPage = await loadFileRevisions(
      repo,
      inventory.head,
      '[new].txt',
      100
    )
    assert.equal(firstPage.length, 1)
    assert.equal(fullPage.length, 3)
    assert.equal(fullPage[0].subject, 'third')
    assert.equal(fullPage[1].parentPath, '[old].txt')
    assert.equal(fullPage[2].path, '[old].txt')
    assert.equal(fullPage[2].body.trim(), 'Body text')
    const old = await readFileSnapshot(repo, {
      revision: fullPage[2].sha,
      path: fullPage[2].path,
    })
    assert.equal(old.contents?.toString(), 'one\n')
    const absent = await readFileSnapshot(repo, {
      revision: fullPage[2].sha,
      path: '[new].txt',
    })
    assert.equal(absent.contents, null)
  })

  it('maps a staged rename back to committed history', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [{ path: 'old.txt', contents: 'one\n' }],
    })
    await exec(['mv', 'old.txt', 'new.txt'], repo.path)
    const inventory = await loadFileInventory(repo)
    assert.equal(inventory.historyPaths.get('new.txt'), 'old.txt')
    assert.ok(inventory.dirty.has('new.txt'))
    const snapshot = await readCurrentSnapshot(repo, 'new.txt')
    assert.equal(snapshot.contents?.toString(), 'one\n')
  })

  it('compares exact snapshots and reverses them without an implicit parent', async t => {
    const repo = await setupEmptyRepository(t)
    const old = Buffer.from('first\n')
    const current = Buffer.from('third\n')
    const diff = await getFileSnapshotDiff(
      repo,
      'file.txt',
      old,
      current,
      false
    )
    assert.equal(diff.kind, DiffType.Text)
    if (diff.kind !== DiffType.Text) {
      throw new Error('Expected text diff')
    }
    assert.match(diff.text, /-first/)
    assert.match(diff.text, /\+third/)
    const reverse = await getFileSnapshotDiff(
      repo,
      'file.txt',
      current,
      old,
      false
    )
    assert.equal(reverse.kind, DiffType.Text)
    if (reverse.kind !== DiffType.Text) {
      throw new Error('Expected text diff')
    }
    assert.match(reverse.text, /-third/)
    assert.match(reverse.text, /\+first/)
  })

  it('uses explicit snapshot image bytes, not implicit historical parents', async t => {
    const repo = await setupEmptyRepository(t)
    const old = Buffer.from('old-image')
    const current = Buffer.from('new-image')
    const diff = await getFileSnapshotDiff(
      repo,
      'image.png',
      old,
      current,
      false
    )
    assert.equal(diff.kind, DiffType.Image)
    if (diff.kind !== DiffType.Image) {
      throw new Error('Expected image diff')
    }
    assert.equal(diff.previous?.contents, old.toString('base64'))
    assert.equal(diff.current?.contents, current.toString('base64'))
  })

  it('keeps binary and unavailable LFS content out of text rendering', async t => {
    const repo = await setupEmptyRepository(t)
    const binary = await getFileSnapshotDiff(
      repo,
      'file.bin',
      null,
      Buffer.from([0, 1]),
      false
    )
    assert.equal(binary.kind, DiffType.Binary)
    const lfs = Buffer.from(
      'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 100\n'
    )
    assert.equal(
      (await getFileSnapshotDiff(repo, 'image.png', null, lfs, false)).kind,
      DiffType.Binary
    )
  })

  it('returns an empty text comparison when disk matches the selected revision', async t => {
    const repo = await setupEmptyRepository(t)
    const same = Buffer.from('same\n')
    const diff = await getFileSnapshotDiff(repo, 'file.txt', same, same, false)
    assert.equal(diff.kind, DiffType.Text)
    if (diff.kind !== DiffType.Text) {
      throw new Error('Expected text diff')
    }
    assert.equal(diff.hunks.length, 0)
  })

  it('sorts folders before files and reveals filter matches without mutating collapse state', () => {
    const collapsed = new Set(['src'])
    const paths = ['z.txt', 'src/b.txt', 'src/a.txt', 'docs/readme.md']
    const rows = buildHistoryTree(paths, collapsed, '')
    assert.deepEqual(
      rows.map(row => row.path),
      ['docs', 'docs/readme.md', 'src', 'z.txt']
    )
    const filtered = buildHistoryTree(paths, collapsed, 'a.txt')
    assert.deepEqual(
      filtered.map(row => row.path),
      ['src', 'src/a.txt']
    )
    assert.deepEqual([...collapsed], ['src'])
  })
})
