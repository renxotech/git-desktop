import * as Path from 'path'
import * as Fs from 'fs/promises'
import { git } from './core'
import { listWorktrees } from './worktree'
import {
  ICleanupPolicy,
  partitionDisposablePaths,
} from './worktree-disposable-files'
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
  readonly changedPaths?: ReadonlyArray<string>
  readonly untrackedPaths?: ReadonlyArray<string>
  readonly ignoredPaths?: ReadonlyArray<string>
  readonly disposablePaths?: ReadonlyArray<string>
  readonly head: string | null
  readonly target: string | null
  readonly gitDir: string | null
  readonly linkTarget?: string
  readonly blockers: ReadonlyArray<string>
  readonly issues: ReadonlyArray<IRemovalSubmoduleIssue>
}

export interface IRemovalSubmoduleIssue {
  readonly kind:
    | 'head-unavailable'
    | 'target-unavailable'
    | 'ancestry-unproven'
    | 'history-unavailable'
  readonly path: string
  readonly revision: string
  readonly message: string
}

const localReadEnvironment = {
  GIT_NO_LAZY_FETCH: '1',
  GIT_OPTIONAL_LOCKS: '0',
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
  return (
    await git(args, path, 'checkWorktreeRemoval', { env: localReadEnvironment })
  ).stdout.trim()
}

async function verifyLocalRevision(path: string, revision: string) {
  const result = await git(
    ['rev-parse', '--verify', '--quiet', '--end-of-options', revision],
    path,
    'verifyLocalSubmoduleRevision',
    { successExitCodes: new Set([0, 1]), env: localReadEnvironment }
  )
  return result.exitCode === 0 ? result.stdout.trim() : null
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
  adminPath: string,
  policy: ICleanupPolicy = { text: null, identity: null }
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
      const issues: IRemovalSubmoduleIssue[] = []
      const addIssue = (issue: IRemovalSubmoduleIssue) => {
        issues.push(issue)
        if (issue.kind === 'head-unavailable') {
          blockers.push(issue.message)
        }
      }
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

      // The gitlink root alone may be a link. Never allow a linked ancestor
      // to route classification or later cleanup into another directory.
      await verifyOrdinaryDirectory(Path.dirname(absolute), true)
      if (!(await cleanupPathExists(absolute))) {
        result.push({
          path,
          state: blockers.length ? 'blocked' : 'uninitialized',
          head: null,
          target: expected,
          gitDir: null,
          blockers,
          issues,
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
          issues,
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
          issues,
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
      if (!(await cleanupPathExists(Path.join(gitDir, 'config')))) {
        throw new Error(
          `Submodule metadata lacks ownership configuration: ${path}`
        )
      }
      const metadata = await inventoryCleanupFiles(gitDir)
      if (metadata.some(e => e.kind === 'link')) {
        throw new Error(`Submodule metadata contains links: ${path}`)
      }
      await checkCleanupIndex(absolute)
      const head = await verifyLocalRevision(absolute, 'HEAD')
      const headAvailable =
        head !== null &&
        (await verifyLocalRevision(absolute, `${head}^{commit}`)) !== null
      const targetAvailable =
        expected !== null &&
        (await verifyLocalRevision(absolute, `${expected}^{commit}`)) !== null
      if (!headAvailable) {
        const revision = head ?? 'HEAD'
        addIssue({
          kind: 'head-unavailable',
          path,
          revision,
          message: `Submodule ${path}: local HEAD commit ${revision} is unavailable. Make this submodule's local history available separately, then review removal again. No fetch or repair is performed.`,
        })
      }
      if (expected !== null && !targetAvailable) {
        addIssue({
          kind: 'target-unavailable',
          path,
          revision: expected,
          message: `Submodule ${path}: target commit ${expected} is unavailable locally. Existing local history will be retained in the verified metadata archive; no fetch or repair is performed.`,
        })
      }
      const incomplete =
        !(await cleanupPathExists(Path.join(gitDir, 'index'))) &&
        (await Fs.readdir(absolute)).every(name => name === '.git')
      const status = !headAvailable
        ? ''
        : await readCleanupGit(
            absolute,
            'status',
            '--porcelain',
            '-z',
            '--untracked-files=all',
            '--ignored=matching',
            '--ignore-submodules=all'
          )
      const staged = !headAvailable
        ? ''
        : await readCleanupGit(
            absolute,
            'diff',
            '--cached',
            '--name-only',
            '-z',
            '--ignore-submodules=none'
          )
      const changedPaths = staged.split('\0').filter(Boolean)
      const untrackedPaths: string[] = []
      const ignoredPaths: string[] = []
      const statusEntries = status.split('\0').filter(Boolean)
      for (let i = 0; i < statusEntries.length; i++) {
        const code = statusEntries[i].slice(0, 2)
        const name = statusEntries[i].slice(3)
        if (code === '??') {
          untrackedPaths.push(name)
        } else if (code === '!!') {
          ignoredPaths.push(name)
        } else {
          changedPaths.push(name)
          if (code.includes('R') || code.includes('C')) {
            i++
          }
        }
      }
      const untracked = await partitionDisposablePaths(
        root,
        absolute,
        untrackedPaths,
        policy
      )
      const ignored = await partitionDisposablePaths(
        root,
        absolute,
        ignoredPaths,
        policy
      )
      if (
        (changedPaths.length ||
          untracked.remaining.length ||
          ignored.remaining.length) &&
        !incomplete
      ) {
        blockers.push(
          'Submodule has staged, modified, untracked or ignored files outside the disposable policy.'
        )
      }
      if (
        expected !== null &&
        targetAvailable &&
        head !== null &&
        headAvailable
      ) {
        const ancestor = await git(
          ['merge-base', '--is-ancestor', head, expected],
          absolute,
          'checkSubmoduleCommits',
          { successExitCodes: new Set([0, 1, 128]), env: localReadEnvironment }
        )
        if (ancestor.exitCode === 1) {
          addIssue({
            kind: 'ancestry-unproven',
            path,
            revision: expected,
            message: `Submodule ${path}: local HEAD ${head} is not proven included in target ${expected}. Existing local commits, refs, stashes and reflogs will be retained in the verified metadata archive.`,
          })
        } else if (ancestor.exitCode !== 0) {
          addIssue({
            kind: 'history-unavailable',
            path,
            revision: expected,
            message: `Submodule ${path}: target ancestry is unavailable. Existing complete local history will be retained in the verified metadata archive. No fetch or repair is performed.`,
          })
        }
      }
      result.push({
        path,
        state: blockers.length
          ? 'blocked'
          : incomplete
          ? 'incomplete'
          : 'clean',
        changedPaths: incomplete ? [] : [...new Set(changedPaths)],
        untrackedPaths: untracked.remaining,
        ignoredPaths: ignored.remaining,
        disposablePaths: [...untracked.disposable, ...ignored.disposable],
        head,
        target: expected,
        gitDir,
        blockers,
        issues,
      })
      if (!incomplete && headAvailable) {
        await visit(absolute, targetAvailable ? expected : null)
      }
    }
  }
  await visit(root, targetSha)
  return result
}
