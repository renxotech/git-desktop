import * as Path from 'path'
import { shortenSHA } from './commit'

export type WorktreeType = 'main' | 'linked'

export type WorktreeEntry = {
  readonly path: string
  readonly alias?: string | null
  readonly isPinned?: boolean
  readonly sandboxRule?: import('../lib/sandbox-rule').ISandboxRule
  readonly head: string
  /** Full ref name (e.g. `refs/heads/main`), or `null` when HEAD is detached */
  readonly branch: string | null
  readonly isDetached: boolean
  readonly type: WorktreeType
  readonly isLocked: boolean
  readonly isPrunable: boolean
}

/** The display name for a worktree (its alias or the basename of its path). */
export function getWorktreeDisplayName(worktree: WorktreeEntry): string {
  return worktree.alias ?? Path.basename(worktree.path)
}

/**
 * The display description for a worktree: its branch name (without the
 * `refs/heads/` prefix) or a shortened HEAD SHA when HEAD is detached.
 */
export function getWorktreeDescription(worktree: WorktreeEntry): string {
  if (worktree.sandboxRule) {
    const rule = worktree.sandboxRule
    return rule.selector === 'branch'
      ? `Follows ${rule.remote}/${rule.sourceBranch}`
      : `${
          rule.selector === 'beta'
            ? 'Beta'
            : rule.selector === 'stable'
            ? 'Stable'
            : 'Tag'
        } · ${rule.lastTag?.replace(/^release-/, '') ?? 'awaiting Fetch'}`
  }
  return worktree.branch
    ? worktree.branch.replace(/^refs\/heads\//, '')
    : shortenSHA(worktree.head)
}
