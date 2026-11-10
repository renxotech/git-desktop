# Combined worktree and branch removal - 2026-11-10

## Outcome and review
- Added action for merged branches checked out in linked worktrees. Current/default branches remain protected. Main, current, locked, missing and multiply checked-out worktrees are rejected by the action-time Git checks.
- Checks run only after clicking the combined action and again before confirmation executes. Confirmation identifies local branch and exact folder; remote branch is retained.
- Blocks staged/unstaged, untracked and ignored files. All repository-wide stashes block removal, with stash descriptions shown. Ownership cannot be reliably inferred from stash labels, so this conservative scope is intentional and explained in the UI. No stashes dropped, no force mode.
- Backend verifies current/default protection, fresh worktree/ref identity, ancestry and file/stash checks. Worktree removal uses Git without force; branch compare-and-delete rejects a concurrently moved tip. Worktree/branch operations are sequential, not transactional: a branch-delete failure explicitly reports that the folder was already removed, with refresh of repository/worktrees.
- Source review found no unresolved actionable issues. Partial-operation error clarity was accepted and fixed. Existing branch configuration may remain after compare-and-delete; it contains configuration only and does not retain the branch ref or worktree. Cleanup is informational and outside destructive removal requirements.

## Verification
- 19/19 focused tests passed: node script/test.mjs app/test/unit/git/worktree-branch-removal-test.ts app/test/unit/git/unmerged-branches-test.ts app/test/unit/ui/repository-health-dialog-test.tsx app/test/unit/group-branches-test.ts
- New cases: clean removal, untracked files introduced after confirmation, staged and ignored files, shared stashes preserved, main/current and locked rejection, changed target/branch rejection, and lazy-check UI blocking.
- TypeScript --noEmit --skipLibCheck passed. Focused ESLint passed with existing unavailable rule @typescript-eslint/no-empty-object-type disabled. Existing test framework warnings remain.
- Validation used disposable local repositories only. No actual project worktree was removed. No build, app launch, commit or push performed for this follow-up; installed package still contains the previous behavior.

## Source checkpoint
- Branch: desktop-improvements; HEAD 7273f6508e39b4197a1f849b0d295a5961e39a0f, plus uncommitted files below.
- app/src/lib/git/worktree-branch-removal.ts: 177861b13f32dbc998729beaef3198971326d13882cf63fbf11f88747f3cb5c2
- app/src/lib/stores/app-store.ts: a7ce2e2ed8c6564e716ac112fccad2c910c61aa441815db94a5ad3a761a92f4a
- app/src/ui/dispatcher/dispatcher.ts: b31c5e2b97c4127a790a57a740539cfd743b93d64487873224f8a7aa1ac04583
- app/src/ui/branches/unmerged-branches-dialog.tsx: e7b389316aa7850ddc967e94cb3d21081b000067f8184fc5a440aa9f4c968c8b
- app/test/unit/git/worktree-branch-removal-test.ts: 09e87031ff8a98422662bd147839054b038f9ce6c5e382f954ee2946693a46c1
- app/test/unit/ui/repository-health-dialog-test.tsx: f3408eff51f11118a8abf84929e31c8c81043a02e83e085dd84e5c59759d0f22
