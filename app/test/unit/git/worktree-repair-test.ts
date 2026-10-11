import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdir, rename, writeFile, readFile, cp, unlink } from 'fs/promises'
import * as Path from 'path'
import { exec } from 'dugite'
import { createTempDirectory } from '../../helpers/temp'
import {
  checkWorktreeLinks,
  repairWorktreeLinks,
} from '../../../src/lib/git/worktree-repair'

describe('worktree link repair', () => {
  it('repairs both links after renaming the parent and preserves dirty files', async t => {
    const root = await createTempDirectory(t)
    const oldPath = Path.join(root, 'Old name')
    const newPath = Path.join(root, 'New name')
    await mkdir(oldPath)
    const run = async (args: string[], cwd: string) => {
      const result = await exec(args, cwd)
      assert.equal(result.exitCode, 0, result.stderr)
      return result.stdout
    }
    await run(['init'], oldPath)
    await run(
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '--allow-empty',
        '-m',
        'initial',
      ],
      oldPath
    )
    await run(
      [
        'worktree',
        'add',
        '-b',
        'test',
        Path.join(oldPath, '.worktrees', 'test'),
      ],
      oldPath
    )
    await writeFile(
      Path.join(oldPath, '.worktrees', 'test', 'dirty.txt'),
      'keep me'
    )
    assert.equal((await checkWorktreeLinks(oldPath))[0].status, 'healthy')
    await rename(oldPath, newPath)
    const before = await checkWorktreeLinks(newPath)
    assert.equal(before[0].status, 'repairable')
    assert.equal(before[0].actualPath, Path.join(newPath, '.worktrees', 'test'))
    const after = await repairWorktreeLinks(newPath)
    assert.equal(after[0].status, 'healthy')
    assert.equal(
      await readFile(
        Path.join(newPath, '.worktrees', 'test', 'dirty.txt'),
        'utf8'
      ),
      'keep me'
    )
    assert.match(
      await run(
        ['status', '--porcelain'],
        Path.join(newPath, '.worktrees', 'test')
      ),
      /dirty.txt/
    )
    assert.equal((await repairWorktreeLinks(newPath))[0].status, 'healthy')
  })

  it('leaves ambiguous copied worktrees unresolved', async t => {
    const root = await createTempDirectory(t)
    const oldPath = Path.join(root, 'old')
    const newPath = Path.join(root, 'new')
    await mkdir(oldPath)
    assert.equal((await exec(['init'], oldPath)).exitCode, 0)
    assert.equal(
      (
        await exec(
          [
            '-c',
            'user.name=Test',
            '-c',
            'user.email=test@example.com',
            'commit',
            '--allow-empty',
            '-m',
            'initial',
          ],
          oldPath
        )
      ).exitCode,
      0
    )
    assert.equal(
      (
        await exec(
          [
            'worktree',
            'add',
            '-b',
            'test',
            Path.join(oldPath, '.worktrees', 'test'),
          ],
          oldPath
        )
      ).exitCode,
      0
    )
    await rename(oldPath, newPath)
    // A copied .git link claiming an already existing registration is ambiguous.
    await cp(
      Path.join(newPath, '.worktrees', 'test'),
      Path.join(newPath, '.worktrees', 'copy'),
      { recursive: true }
    )
    // Give both folders the same current metadata pointer, while registration is stale.
    const pointer = `gitdir: ${Path.join(
      newPath,
      '.git',
      'worktrees',
      'test'
    )}\n`
    await unlink(Path.join(newPath, '.worktrees', 'test', '.git'))
    await unlink(Path.join(newPath, '.worktrees', 'copy', '.git'))
    await writeFile(Path.join(newPath, '.worktrees', 'test', '.git'), pointer)
    await writeFile(Path.join(newPath, '.worktrees', 'copy', '.git'), pointer)
    assert.equal((await checkWorktreeLinks(newPath))[0].status, 'unresolved')
    assert.equal((await repairWorktreeLinks(newPath))[0].status, 'unresolved')
  })
})
