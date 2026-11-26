import { WorktreeEntry } from '../models/worktree'

/**
 * Whether a selected repository's worktree dropdown should be shown.
 *
 * Keep toolbar rendering and its resizable pane constraints in sync.
 */
export function shouldShowWorktreeDropdown(
  worktreeCount: number,
  isOpen: boolean,
  alwaysShowWorktreeList: boolean
): boolean {
  return alwaysShowWorktreeList || worktreeCount > 1 || isOpen
}

/** Sort by branch tip committer date, preserving input order for ties. */
export function sortWorktreesByCommitDate(
  worktrees: ReadonlyArray<WorktreeEntry>,
  dates: ReadonlyMap<string, number>
): ReadonlyArray<WorktreeEntry> {
  const dateFor = (worktree: WorktreeEntry) =>
    (worktree.branch === null ? undefined : dates.get(worktree.branch)) ??
    Number.NEGATIVE_INFINITY

  return [...worktrees].sort((a, b) => dateFor(b) - dateFor(a))
}
