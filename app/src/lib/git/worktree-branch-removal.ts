import * as Path from 'path'
import { git } from './core'
import { listWorktrees, removeWorktree } from './worktree'

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
  const readSha = async (ref: string) =>
    (
      await git(
        ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
        repositoryPath,
        'checkWorktreeRemoval'
      )
    ).stdout.trim()
  const [branchSha, targetSha, currentRef] = await Promise.all([
    readSha(branchRef),
    readSha(targetRef),
    git(['symbolic-ref', '-q', 'HEAD'], repositoryPath, 'checkWorktreeRemoval'),
  ])
  if (currentRef.stdout.trim() === branchRef) {
    throw new Error('The current branch cannot be removed.')
  }
  await git(
    ['merge-base', '--is-ancestor', branchSha, targetSha],
    repositoryPath,
    'checkMergedWorktreeRemoval'
  )
  const [status, stash] = await Promise.all([
    git(
      [
        'status',
        '--porcelain',
        '-z',
        '--untracked-files=normal',
        '--ignored=matching',
      ],
      worktree.path,
      'checkWorktreeFiles'
    ),
    git(
      ['stash', 'list', '--format=%gd: %gs'],
      repositoryPath,
      'checkWorktreeStashes'
    ),
  ])
  const ignoredPaths: string[] = []
  const untrackedPaths: string[] = []
  const changedPaths: string[] = []
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
  }
}

/** Revalidate the confirmed snapshot before touching the directory or branch. */
export async function removeCheckedWorktreeAndBranch(
  repositoryPath: string,
  confirmed: IWorktreeBranchRemoval,
  includeIgnored = false
): Promise<void> {
  const fresh = await checkWorktreeBranchRemoval(
    repositoryPath,
    confirmed.branchRef,
    confirmed.targetRef
  )
  if (
    fresh.path !== confirmed.path ||
    fresh.branchSha !== confirmed.branchSha ||
    fresh.targetSha !== confirmed.targetSha
  ) {
    throw new Error(
      'The branch, target or worktree changed. Refresh and review removal again.'
    )
  }
  if (fresh.hasFiles) {
    throw new Error(
      'Uncommitted or untracked files must be handled before removal.'
    )
  }
  if (fresh.ignoredPaths.length) {
    if (!includeIgnored) {
      throw new Error('Review and confirm removal of ignored files first.')
    }
    if (
      JSON.stringify([...fresh.ignoredPaths].sort()) !==
      JSON.stringify([...confirmed.ignoredPaths].sort())
    ) {
      throw new Error(
        'The ignored file list changed. Go back and review removal again.'
      )
    }
    const top = (
      await git(
        ['rev-parse', '--show-toplevel'],
        fresh.path,
        'verifyCleanupRoot'
      )
    ).stdout.trim()
    if (
      Path.resolve(top) !== Path.resolve(fresh.path) ||
      fresh.ignoredPaths.some(
        p => Path.isAbsolute(p) || p.split(/[\\/]/).includes('..')
      )
    ) {
      throw new Error(
        'Cannot verify the cleanup paths inside the selected worktree.'
      )
    }
    // Clean only explicitly reviewed ignored paths; never force the whole worktree.
    await git(
      ['--literal-pathspecs', 'clean', '-fdX', '--', ...fresh.ignoredPaths],
      fresh.path,
      'cleanReviewedIgnoredFiles'
    )
    const rechecked = await checkWorktreeBranchRemoval(
      repositoryPath,
      confirmed.branchRef,
      confirmed.targetRef
    )
    if (
      rechecked.hasFiles ||
      rechecked.ignoredPaths.length ||
      rechecked.branchSha !== confirmed.branchSha ||
      rechecked.targetSha !== confirmed.targetSha
    ) {
      throw new Error(
        'The worktree changed or some ignored files could not be cleaned. Review it again.'
      )
    }
  }
  // Never force: Git independently rejects a dirty, locked or in-use worktree.
  await removeWorktree(repositoryPath, fresh.path, false)
  // Compare-and-delete prevents removing a branch whose tip changed during removal.
  try {
    await git(
      ['update-ref', '-d', fresh.branchRef, fresh.branchSha],
      repositoryPath,
      'removeMergedWorktreeBranch'
    )
  } catch (error) {
    throw new Error(
      `The worktree folder was removed, but the branch could not be deleted. Refresh the list and review the remaining branch. ${String(
        error
      )}`
    )
  }
}
