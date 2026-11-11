import * as Path from 'path'
import * as Fs from 'fs/promises'
import { randomUUID } from 'crypto'
import { assertSandboxMutationAllowed } from '../sandbox-rule'
import { git } from './core'
import {
  getRepositoryGitReadEnvironment,
  withRepositoryGitDestruction,
  withRepositoryGitOperation,
  withRepositoryGitResourceMutation,
} from './repository-operation'
import {
  listWorktrees,
  listWorktreesFromGitDir,
  removeWorktree,
} from './worktree'
import {
  ICleanupEntry,
  inventoryCleanupFiles,
  removeCleanupFiles,
  verifyOrdinaryDirectory,
} from './worktree-cleanup-files'
import {
  IRemovalSubmodule,
  checkRemovalSubmodules,
  checkCleanupIndex,
  cleanupPathExists,
  isInsideDirectory,
  readCleanupGit,
} from './worktree-removal-submodules'

export interface IWorktreeBranchRemoval {
  readonly path: string
  readonly branchRef: string
  readonly branchSha: string
  readonly targetSha: string
  readonly targetRef: string
  readonly stashes: ReadonlyArray<string>
  readonly ignoredPaths: ReadonlyArray<string>
  readonly untrackedPaths: ReadonlyArray<string>
  readonly changedPaths: ReadonlyArray<string>
  readonly hasFiles: boolean
  readonly submodules: ReadonlyArray<IRemovalSubmodule>
  readonly metadataPaths: ReadonlyArray<string>
  readonly metadataBackupRoot: string
  readonly adminPath: string
  readonly files: ReadonlyArray<ICleanupEntry>
}

/** Expensive checks are intentionally performed only when removal is requested. */
export async function checkWorktreeBranchRemoval(
  repositoryPath: string,
  branchRef: string,
  targetRef: string
): Promise<IWorktreeBranchRemoval> {
  if (!branchRef.startsWith('refs/heads/')) {
    throw new Error('Only local branches can have a worktree removed.')
  }
  const worktrees = await listWorktrees(repositoryPath)
  const matches = worktrees.filter(w => w.branch === branchRef)
  if (matches.length !== 1) {
    throw new Error(
      'The branch must be checked out in exactly one linked worktree. Refresh the list.'
    )
  }
  const worktree = matches[0]
  if (
    worktree.type === 'main' ||
    Path.resolve(worktree.path) === Path.resolve(repositoryPath)
  ) {
    throw new Error('The main or current worktree cannot be removed here.')
  }
  if (worktree.isLocked || worktree.isPrunable) {
    throw new Error(
      'This worktree is locked or unavailable. Resolve that before removing it.'
    )
  }
  await verifyOrdinaryDirectory(worktree.path)
  const realRoot = await Fs.realpath(worktree.path)
  for (const other of worktrees.filter(w => w.path !== worktree.path)) {
    if (await cleanupPathExists(other.path)) {
      const realOther = await Fs.realpath(other.path)
      if (realRoot === realOther || isInsideDirectory(realRoot, realOther)) {
        throw new Error(
          'Another worktree is inside or aliases the selected cleanup directory.'
        )
      }
    }
  }
  const readSha = (ref: string) =>
    readCleanupGit(
      repositoryPath,
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${ref}^{commit}`
    )
  const [branchSha, targetSha, currentRef] = await Promise.all([
    readSha(branchRef),
    readSha(targetRef),
    readCleanupGit(repositoryPath, 'symbolic-ref', '-q', 'HEAD'),
  ])
  if (currentRef === branchRef) {
    throw new Error('The current branch cannot be removed.')
  }
  await git(
    ['merge-base', '--is-ancestor', branchSha, targetSha],
    repositoryPath,
    'checkMergedWorktreeRemoval'
  )
  if (
    Path.resolve(
      await readCleanupGit(worktree.path, 'rev-parse', '--show-toplevel')
    ) !== Path.resolve(worktree.path) ||
    (await readCleanupGit(worktree.path, 'rev-parse', '--verify', 'HEAD')) !==
      branchSha
  ) {
    throw new Error('Cannot verify the selected worktree root and HEAD.')
  }
  const adminPath = Path.resolve(
    await readCleanupGit(worktree.path, 'rev-parse', '--absolute-git-dir')
  )
  const commonDir = Path.resolve(
    worktree.path,
    await readCleanupGit(worktree.path, 'rev-parse', '--git-common-dir')
  )
  const callerCommonDir = Path.resolve(
    repositoryPath,
    await readCleanupGit(repositoryPath, 'rev-parse', '--git-common-dir')
  )
  if (
    commonDir !== callerCommonDir ||
    !isInsideDirectory(Path.join(commonDir, 'worktrees'), adminPath) ||
    (await readCleanupGit(worktree.path, 'symbolic-ref', '-q', 'HEAD')) !==
      branchRef ||
    Path.resolve(
      adminPath,
      (await Fs.readFile(Path.join(adminPath, 'gitdir'), 'utf8')).trim()
    ) !== Path.join(worktree.path, '.git')
  ) {
    throw new Error('Cannot verify the linked worktree metadata directory.')
  }
  await checkCleanupIndex(worktree.path)
  const submodules = await checkRemovalSubmodules(
    worktree.path,
    targetSha,
    adminPath
  )
  const [status, staged, stash] = await Promise.all([
    git(
      [
        'status',
        '--porcelain',
        '-z',
        '--untracked-files=all',
        '--ignored=matching',
        '--ignore-submodules=all',
      ],
      worktree.path,
      'checkWorktreeFiles'
    ),
    git(
      ['diff', '--cached', '--name-only', '-z', '--ignore-submodules=none'],
      worktree.path,
      'checkStagedWorktreeFiles'
    ),
    git(
      ['stash', 'list', '--format=%gd: %gs'],
      repositoryPath,
      'checkWorktreeStashes'
    ),
  ])
  const ignoredPaths: string[] = []
  const untrackedPaths: string[] = []
  const changedPaths: string[] = staged.stdout.split('\0').filter(Boolean)
  const entries = status.stdout.split('\0').filter(Boolean)
  for (let i = 0; i < entries.length; i++) {
    const code = entries[i].slice(0, 2)
    const path = entries[i].slice(3)
    if (code === '!!') {
      ignoredPaths.push(path)
    } else if (code === '??') {
      untrackedPaths.push(path)
    } else {
      changedPaths.push(path)
      if (code.includes('R') || code.includes('C')) {
        i++
      }
    }
  }
  for (const module of submodules.filter(m => m.blockers.length > 0)) {
    changedPaths.push(module.path)
  }
  const metadataPaths = submodules.flatMap(m =>
    m.gitDir === null ? [] : [m.gitDir]
  )
  // Retain the complete container: it can also hold inactive submodule refs,
  // stashes, reflogs and unreachable objects which HEAD checks cannot protect.
  const modulesPath = Path.join(adminPath, 'modules')
  if (await cleanupPathExists(modulesPath)) {
    const metadata = await inventoryCleanupFiles(modulesPath)
    if (metadata.some(e => e.kind === 'link')) {
      throw new Error(
        'Worktree submodule metadata contains links; removal is blocked.'
      )
    }
    // An inactive module can still belong to another checkout. Its metadata
    // must meet the same ownership rule before the containing directory moves.
    for (const entry of metadata.filter(
      e => Path.basename(e.path) === 'config'
    )) {
      const directory = Path.dirname(Path.join(modulesPath, entry.path))
      const owner = await readCleanupGit(
        worktree.path,
        'config',
        '--file',
        Path.join(directory, 'config'),
        '--get',
        'core.worktree'
      )
      if (
        !isInsideDirectory(worktree.path, Path.resolve(directory, owner)) ||
        (await cleanupPathExists(Path.join(directory, 'commondir'))) ||
        (await listWorktreesFromGitDir(directory)).length !== 1 ||
        ((await cleanupPathExists(Path.join(directory, 'worktrees'))) &&
          (await Fs.readdir(Path.join(directory, 'worktrees'))).length > 0)
      ) {
        throw new Error(
          'Cannot prove ownership of inactive submodule metadata.'
        )
      }
    }
    for (const entry of metadata.filter(
      e => Path.basename(e.path) === 'HEAD'
    )) {
      const directory = Path.dirname(Path.join(modulesPath, entry.path))
      if (
        (await cleanupPathExists(Path.join(directory, 'objects'))) &&
        !(await cleanupPathExists(Path.join(directory, 'config')))
      ) {
        throw new Error(
          'Inactive submodule metadata lacks ownership configuration.'
        )
      }
    }
    metadataPaths.push(modulesPath)
  }
  for (const metadataPath of metadataPaths) {
    const entries = await inventoryCleanupFiles(metadataPath)
    // Git expands transitive alternates (and environment routing); inspecting
    // only this store's alternates file can miss a later disposable object dir.
    for (const entry of entries.filter(
      e => Path.basename(e.path) === 'config'
    )) {
      const directory = Path.dirname(Path.join(metadataPath, entry.path))
      if (!(await cleanupPathExists(Path.join(directory, 'HEAD')))) {
        continue
      }
      const primary = await readCleanupGit(
        worktree.path,
        '--git-dir',
        directory,
        'rev-parse',
        '--path-format=absolute',
        '--git-path',
        'objects'
      )
      if (Path.resolve(primary) !== Path.join(directory, 'objects')) {
        throw new Error(
          'Redirected primary object storage prevents safe metadata retention.'
        )
      }
      const graph = await readCleanupGit(
        worktree.path,
        '--git-dir',
        directory,
        'count-objects',
        '-v'
      )
      for (const line of graph
        .split(/\r?\n/)
        .filter(line => line.startsWith('alternate: '))) {
        const alternate = line.slice('alternate: '.length)
        if (!Path.isAbsolute(alternate) || alternate.startsWith('"')) {
          throw new Error(
            'Cannot verify the complete alternate object routing for retained metadata.'
          )
        }
        const actual = await Fs.realpath(alternate)
        if (
          Path.resolve(alternate) === Path.resolve(worktree.path) ||
          Path.resolve(alternate) === Path.resolve(adminPath) ||
          isInsideDirectory(worktree.path, Path.resolve(alternate)) ||
          isInsideDirectory(adminPath, Path.resolve(alternate)) ||
          actual === Path.resolve(worktree.path) ||
          actual === Path.resolve(adminPath) ||
          isInsideDirectory(worktree.path, actual) ||
          isInsideDirectory(adminPath, actual)
        ) {
          throw new Error(
            'An alternate object dependency would be removed with the worktree.'
          )
        }
      }
    }
    for (const entry of entries.filter(
      e => Path.basename(e.path) === 'alternates'
    )) {
      const alternates = await Fs.readFile(
        Path.join(metadataPath, entry.path),
        'utf8'
      )
      if (
        alternates
          .split(/\r?\n/)
          .filter(Boolean)
          .some(
            path =>
              !Path.isAbsolute(path) ||
              Path.resolve(path) === Path.resolve(worktree.path) ||
              Path.resolve(path) === Path.resolve(adminPath) ||
              isInsideDirectory(worktree.path, Path.resolve(path)) ||
              isInsideDirectory(adminPath, Path.resolve(path))
          )
      ) {
        throw new Error(
          'Relative or disposable object alternates prevent safe submodule metadata retention.'
        )
      }
      for (const alternate of alternates.split(/\r?\n/).filter(Boolean)) {
        const actual = await Fs.realpath(alternate)
        if (
          actual === Path.resolve(worktree.path) ||
          actual === Path.resolve(adminPath) ||
          isInsideDirectory(worktree.path, actual) ||
          isInsideDirectory(adminPath, actual)
        ) {
          throw new Error(
            'An object alternate resolves into files selected for removal.'
          )
        }
      }
    }
  }
  const preserved = metadataPaths.filter(path =>
    isInsideDirectory(worktree.path, path)
  )
  const files = await inventoryCleanupFiles(worktree.path, preserved)
  const modulePointers = new Set(submodules.map(m => Path.join(m.path, '.git')))
  for (const entry of files) {
    if (
      Path.basename(entry.path) === '.git' &&
      entry.path !== '.git' &&
      !modulePointers.has(entry.path)
    ) {
      throw new Error(`Nested repository prevents cleanup: ${entry.path}`)
    }
    if (
      entry.kind === 'directory' &&
      entry.path &&
      !preserved.includes(Path.join(worktree.path, entry.path))
    ) {
      const directory = Path.join(worktree.path, entry.path)
      if (
        (await cleanupPathExists(Path.join(directory, 'HEAD'))) &&
        (await cleanupPathExists(Path.join(directory, 'objects'))) &&
        (await cleanupPathExists(Path.join(directory, 'refs')))
      ) {
        throw new Error(
          `Nested bare repository prevents cleanup: ${entry.path}`
        )
      }
    }
  }
  return {
    path: worktree.path,
    branchRef,
    branchSha,
    targetSha,
    targetRef,
    ignoredPaths,
    untrackedPaths,
    changedPaths,
    hasFiles: changedPaths.length > 0 || untrackedPaths.length > 0,
    stashes: stash.stdout.trim().split('\n').filter(Boolean),
    submodules,
    metadataPaths: metadataPaths.filter(
      (path, i, all) =>
        all.indexOf(path) === i &&
        !all.some(other => isInsideDirectory(other, path))
    ),
    metadataBackupRoot: Path.join(
      commonDir,
      'desktop-worktree-metadata-backups'
    ),
    adminPath,
    files,
  }
}

function sameSnapshot(a: IWorktreeBranchRemoval, b: IWorktreeBranchRemoval) {
  return (
    a.path === b.path &&
    a.branchSha === b.branchSha &&
    a.targetSha === b.targetSha &&
    a.adminPath === b.adminPath &&
    a.metadataBackupRoot === b.metadataBackupRoot &&
    JSON.stringify(a.submodules) === JSON.stringify(b.submodules) &&
    JSON.stringify(a.metadataPaths) === JSON.stringify(b.metadataPaths)
  )
}

/** Revalidate consent and preserve metadata before nonrecursive folder cleanup. */
export async function removeCheckedWorktreeAndBranch(
  repositoryPath: string,
  confirmed: IWorktreeBranchRemoval,
  includeIgnored = false,
  includeSubmodules = false
): Promise<string | null> {
  if (getRepositoryGitReadEnvironment() !== undefined) {
    throw new Error('Worktree cleanup cannot run in a read-only operation.')
  }
  return withRepositoryGitDestruction(confirmed.path, () =>
    withRepositoryGitOperation(repositoryPath, 'mutation', () =>
      withRepositoryGitOperation(confirmed.path, 'mutation', () =>
        removeCheckedWorktreeAndBranchCore(
          repositoryPath,
          confirmed,
          includeIgnored,
          includeSubmodules
        )
      )
    )
  )
}

async function removeCheckedWorktreeAndBranchCore(
  repositoryPath: string,
  confirmed: IWorktreeBranchRemoval,
  includeIgnored: boolean,
  includeSubmodules: boolean
): Promise<string | null> {
  const fresh = await checkWorktreeBranchRemoval(
    repositoryPath,
    confirmed.branchRef,
    confirmed.targetRef
  )
  if (!sameSnapshot(fresh, confirmed)) {
    throw new Error(
      'The branch, target, submodules or worktree changed. Refresh and review removal again.'
    )
  }
  if (fresh.hasFiles) {
    throw new Error(
      'Uncommitted or untracked files must be handled before removal.'
    )
  }
  if (fresh.ignoredPaths.length && includeIgnored !== true) {
    throw new Error('Review and confirm removal of ignored files first.')
  }
  if (
    JSON.stringify(fresh.ignoredPaths) !==
    JSON.stringify(confirmed.ignoredPaths)
  ) {
    throw new Error(
      'The ignored file list changed. Go back and review removal again.'
    )
  }
  if (
    (fresh.submodules.length || fresh.metadataPaths.length) &&
    includeSubmodules !== true
  ) {
    throw new Error(
      'Review and confirm removal of submodule checkouts and retention of their metadata first.'
    )
  }
  if (JSON.stringify(fresh.files) !== JSON.stringify(confirmed.files)) {
    throw new Error(
      'The worktree file inventory changed. Review removal again.'
    )
  }
  // A second complete Git check follows inventory and precedes all mutations.
  const final = await checkWorktreeBranchRemoval(
    repositoryPath,
    confirmed.branchRef,
    confirmed.targetRef
  )
  if (
    !sameSnapshot(fresh, final) ||
    final.hasFiles ||
    JSON.stringify(fresh.files) !== JSON.stringify(final.files)
  ) {
    throw new Error(
      'The worktree changed during validation. Review removal again.'
    )
  }
  let backup: string | null = null
  let changed = false
  await assertSandboxMutationAllowed(
    ['worktree', 'remove', '--force', fresh.path],
    repositoryPath
  )
  await assertSandboxMutationAllowed(
    ['update-ref', '-d', fresh.branchRef, fresh.branchSha],
    repositoryPath
  )
  return withRepositoryGitResourceMutation(
    [fresh.adminPath, fresh.metadataBackupRoot, ...fresh.metadataPaths],
    async () => {
      try {
        if (fresh.metadataPaths.length) {
          if (!(await cleanupPathExists(fresh.metadataBackupRoot))) {
            await Fs.mkdir(fresh.metadataBackupRoot)
          }
          await verifyOrdinaryDirectory(fresh.metadataBackupRoot)
          backup = Path.join(fresh.metadataBackupRoot, randomUUID())
          await Fs.mkdir(backup)
          const submodules = await Promise.all(
            fresh.submodules.map(async module => {
              const pointer = Path.join(fresh.path, module.path, '.git')
              return {
                ...module,
                gitPointer:
                  module.gitDir !== null && (await Fs.lstat(pointer)).isFile()
                    ? await Fs.readFile(pointer, 'utf8')
                    : null,
              }
            })
          )
          await Fs.writeFile(
            Path.join(backup, 'restore.json'),
            JSON.stringify(
              {
                worktree: fresh.path,
                branch: fresh.branchRef,
                head: fresh.branchSha,
                submodules,
                metadata: fresh.metadataPaths.map((original, i) => ({
                  original,
                  saved: String(i),
                })),
              },
              null,
              2
            ),
            { flag: 'wx' }
          )
          for (let i = 0; i < fresh.metadataPaths.length; i++) {
            const original = fresh.metadataPaths[i]
            await verifyOrdinaryDirectory(original)
            await Fs.rename(original, Path.join(backup, String(i)))
            changed = true
          }
        }
        changed = true
        await removeCleanupFiles(fresh.path, fresh.files, fresh.metadataPaths)
        if (await cleanupPathExists(fresh.path)) {
          throw new Error(
            'The removed worktree path was recreated before unregistering it.'
          )
        }
        const adminFiles = await inventoryCleanupFiles(fresh.adminPath)
        if (
          adminFiles.some(e => e.kind === 'link') ||
          (await cleanupPathExists(Path.join(fresh.adminPath, 'modules')))
        ) {
          throw new Error('Worktree metadata changed before unregistering it.')
        }
        const worktrees = await listWorktrees(repositoryPath)
        const selected = worktrees.find(w => w.path === fresh.path)
        if (
          !selected ||
          selected.isLocked ||
          selected.branch !== fresh.branchRef ||
          selected.head !== fresh.branchSha ||
          (await cleanupPathExists(fresh.path))
        ) {
          throw new Error('The worktree registration changed before removal.')
        }
        // Git sees an absent checkout and module-free, link-free admin metadata.
        // Force never serves as permission to delete unchecked working files.
        await removeWorktree(repositoryPath, fresh.path, true)
      } catch (error) {
        throw new Error(
          `${
            changed
              ? 'Cleanup stopped after partial changes; the branch was kept. '
              : ''
          }${
            backup ? `Submodule metadata retention directory: ${backup}. ` : ''
          }${String(error)}`
        )
      }
      try {
        const target = await readCleanupGit(
          repositoryPath,
          'rev-parse',
          '--verify',
          '--end-of-options',
          `${fresh.targetRef}^{commit}`
        )
        if (
          target !== fresh.targetSha ||
          (await listWorktrees(repositoryPath)).some(
            w => w.branch === fresh.branchRef
          )
        ) {
          throw new Error(
            'The target or branch checkout changed during removal.'
          )
        }
        await git(
          ['update-ref', '-d', fresh.branchRef, fresh.branchSha],
          repositoryPath,
          'removeMergedWorktreeBranch'
        )
      } catch (error) {
        throw new Error(
          `The worktree folder was removed, but the branch could not be deleted. Refresh and review the remaining branch. ${
            backup ? `Retained submodule metadata: ${backup}. ` : ''
          }${String(error)}`
        )
      }
      return backup
    }
  )
}
