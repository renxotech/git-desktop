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
  return {
    path: worktree.path,
    branchRef,
    branchSha,
    targetSha,
    targetRef,
    hasFiles: status.stdout.length > 0,
    stashes: stash.stdout.trim().split('\n').filter(Boolean),
  }
}

/** Revalidate the confirmed snapshot before touching the directory or branch. */
export async function removeCheckedWorktreeAndBranch(
  repositoryPath: string,
  confirmed: IWorktreeBranchRemoval
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
  if (fresh.hasFiles || fresh.stashes.length) {
    throw new Error(
      'Uncommitted, untracked, ignored or stashed files must be handled before removal.'
    )
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
