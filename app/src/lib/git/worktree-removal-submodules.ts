import * as Path from 'path'
import * as Fs from 'fs/promises'
import { git } from './core'
import { listWorktrees } from './worktree'
import {
  inventoryCleanupFiles,
  verifyOrdinaryDirectory,
} from './worktree-cleanup-files'

export interface IRemovalSubmodule {
  readonly path: string
  readonly state:
    | 'clean'
    | 'uninitialized'
    | 'incomplete'
    | 'linked'
    | 'blocked'
  readonly head: string | null
  readonly target: string | null
  readonly gitDir: string | null
  readonly linkTarget?: string
  readonly blockers: ReadonlyArray<string>
}

export function isInsideDirectory(root: string, path: string) {
  const relative = Path.relative(root, path)
  return (
    relative !== '' &&
    !Path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith(`..${Path.sep}`)
  )
}

export async function cleanupPathExists(path: string) {
  try {
    await Fs.lstat(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export async function readCleanupGit(path: string, ...args: string[]) {
  return (await git(args, path, 'checkWorktreeRemoval')).stdout.trim()
}

/** Reject active operations and index flags which can conceal changed files. */
export async function checkCleanupIndex(path: string) {
  const files = await readCleanupGit(path, 'ls-files', '-v', '-z')
  if (
    files
      .split('\0')
      .some(e => e && (e[0] === 'S' || e[0] === e[0].toLowerCase()))
  ) {
    throw new Error(
      'Hidden index entries (skip-worktree/assume-unchanged) must be resolved before removal.'
    )
  }
  for (const name of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-merge',
    'rebase-apply',
    'index.lock',
  ]) {
    const location = await readCleanupGit(path, 'rev-parse', '--git-path', name)
    if (await cleanupPathExists(Path.resolve(path, location))) {
      throw new Error('An active Git operation prevents worktree removal.')
    }
  }
}

async function gitlinks(path: string) {
  const result = await readCleanupGit(path, 'ls-files', '--stage', '-z')
  return result
    .split('\0')
    .filter(e => e.startsWith('160000 '))
    .map(e => {
      const tab = e.indexOf('\t')
      const header = e.slice(0, tab).split(' ')
      if (tab < 0 || header[2] !== '0') {
        throw new Error('Unmerged submodule index entries prevent removal.')
      }
      return e.slice(tab + 1)
    })
}

/** Inspect recursively without repairing or resetting any submodule state. */
export async function checkRemovalSubmodules(
  root: string,
  targetSha: string,
  adminPath: string
): Promise<ReadonlyArray<IRemovalSubmodule>> {
  const result: IRemovalSubmodule[] = []
  const visit = async (
    parent: string,
    target: string | null
  ): Promise<void> => {
    for (const relative of await gitlinks(parent)) {
      const absolute = Path.resolve(parent, relative)
      if (!isInsideDirectory(parent, absolute)) {
        throw new Error('Invalid submodule path prevents removal.')
      }
      const path = Path.relative(root, absolute)
      const blockers: string[] = []
      const entry =
        target === null
          ? ''
          : await readCleanupGit(
              parent,
              '--literal-pathspecs',
              'ls-tree',
              '-z',
              target,
              '--',
              relative
            )
      const expected = /^160000 commit ([0-9a-f]+)\t/.exec(entry)?.[1] ?? null
      if (!expected) {
        blockers.push(
          'The selected target does not retain this submodule commit.'
        )
      }
      // The gitlink root alone may be a link. Never allow a linked ancestor
      // to route classification or later cleanup into another directory.
      await verifyOrdinaryDirectory(Path.dirname(absolute))
      if (!(await cleanupPathExists(absolute))) {
        result.push({
          path,
          state: blockers.length ? 'blocked' : 'uninitialized',
          head: null,
          target: expected,
          gitDir: null,
          blockers,
        })
        continue
      }
      if ((await Fs.lstat(absolute)).isSymbolicLink()) {
        // Shared checkouts are represented by one disposable link, not by the
        // target's files or Git metadata. Do not read .git or run Git there.
        result.push({
          path,
          state: blockers.length ? 'blocked' : 'linked',
          head: null,
          target: expected,
          gitDir: null,
          linkTarget: await Fs.readlink(absolute),
          blockers,
        })
        continue
      }
      await verifyOrdinaryDirectory(absolute)
      const pointer = Path.join(absolute, '.git')
      if (!(await cleanupPathExists(pointer))) {
        if ((await Fs.readdir(absolute)).length > 0) {
          blockers.push(
            'Uninitialized submodule contains files; move or initialize them before removal.'
          )
        }
        result.push({
          path,
          state: blockers.length ? 'blocked' : 'uninitialized',
          head: null,
          target: expected,
          gitDir: null,
          blockers,
        })
        continue
      }
      if ((await Fs.lstat(pointer)).isSymbolicLink()) {
        throw new Error(`Submodule metadata pointer is a link: ${path}`)
      }
      const gitDir = Path.resolve(
        absolute,
        await readCleanupGit(absolute, 'rev-parse', '--absolute-git-dir')
      )
      const commonDir = Path.resolve(
        absolute,
        await readCleanupGit(absolute, 'rev-parse', '--git-common-dir')
      )
      const modules = Path.join(adminPath, 'modules')
      if (
        gitDir !== commonDir ||
        !(isInsideDirectory(modules, gitDir) || gitDir === pointer) ||
        Path.resolve(
          await readCleanupGit(absolute, 'rev-parse', '--show-toplevel')
        ) !== absolute ||
        (await listWorktrees(absolute)).length !== 1
      ) {
        throw new Error(
          `Cannot prove exclusive submodule metadata ownership: ${path}`
        )
      }
      const metadata = await inventoryCleanupFiles(gitDir)
      if (metadata.some(e => e.kind === 'link')) {
        throw new Error(`Submodule metadata contains links: ${path}`)
      }
      await checkCleanupIndex(absolute)
      const head = await readCleanupGit(
        absolute,
        'rev-parse',
        '--verify',
        'HEAD^{commit}'
      )
      const incomplete =
        !(await cleanupPathExists(Path.join(gitDir, 'index'))) &&
        (await Fs.readdir(absolute)).every(name => name === '.git')
      const status = await readCleanupGit(
        absolute,
        'status',
        '--porcelain',
        '-z',
        '--untracked-files=all',
        '--ignored=matching',
        '--ignore-submodules=all'
      )
      const staged = await readCleanupGit(
        absolute,
        'diff',
        '--cached',
        '--name-only',
        '-z',
        '--ignore-submodules=none'
      )
      if ((status || staged) && !incomplete) {
        blockers.push(
          'Submodule has staged, modified, untracked or ignored files.'
        )
      }
      if (expected) {
        const ancestor = await git(
          ['merge-base', '--is-ancestor', head, expected],
          absolute,
          'checkSubmoduleCommits',
          { successExitCodes: new Set([0, 1]) }
        )
        if (ancestor.exitCode !== 0) {
          blockers.push(
            'Submodule HEAD contains commits outside the selected target.'
          )
        }
      }
      result.push({
        path,
        state: blockers.length
          ? 'blocked'
          : incomplete
          ? 'incomplete'
          : 'clean',
        head,
        target: expected,
        gitDir,
        blockers,
      })
      if (!incomplete) {
        await visit(absolute, expected)
      }
    }
  }
  await visit(root, targetSha)
  return result
}
