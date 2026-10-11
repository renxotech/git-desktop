# Worktree check and repair

Added a gear button at the far right of the main toolbar, shown when the selected repository has linked worktrees. Its menu contains **Check and repair worktrees…**. The worktree dropdown retains its original search field and New worktree button; the repair action no longer takes space from its filter row.

The dialog reads the repository's common Git directory and its worktree registrations. It checks each recorded folder and immediate folders under the main repository's `.worktrees` directory. A relocated folder must identify the exact metadata entry and agree with the old registration under the inferred old repository root. An existing metadata target belonging to another location is not treated as a renamed-root candidate. Multiple matching folders remain unresolved.

Repair rechecks the links, passes only uniquely matched repairable folders to `git worktree repair`, checks the result again, and refreshes the repository. It does not prune, recreate worktrees, move folders, or alter branches. Errors remain visible in the dialog. Arbitrarily relocated external worktrees and missing registrations require manual investigation; this feature does not search the whole disk or rewrite stale repository records in Desktop's database.

## Validation

On 2026-10-07, the check report was revised to separate issues from information: summary counts at the top, issues first with explicit repairable/manual-action labels, healthy entries collapsed under Information, and a repair button showing the number of affected worktrees. TypeScript with `--skipLibCheck` and focused lint passed for this report change. The production build and packaging succeeded, and the updated application window opened. The report has not been visually inspected in the live app.

- 38 focused tests passed: worktree repair, existing Git worktree tests, and worktree dropdown visibility tests.
- The new integration test uses real Git, renames a parent folder containing a linked worktree, repairs both metadata links, verifies an uncommitted file remains intact and visible to Git status, and repeats repair successfully.
- A second integration test verifies ambiguous copied worktree pointers remain unresolved.
- Focused ESLint passed for the new repair library/dialog/tests and the worktree list.
- Application TypeScript check passed with `--skipLibCheck`. The default check is blocked by an existing WeakMap declaration conflict between dependency declarations.
- Tests required execution outside the Windows sandbox because Git could not write temporary repository metadata inside it.

The production package was rebuilt and relaunched after moving the action into the gear menu. The running executable's main window and the packaged menu label and compact gear styling were verified. This is process and bundle verification; the gear menu has not been visually inspected or clicked in the live application. Focused lint, formatting, and TypeScript with `--skipLibCheck` passed after the placement change. Existing unrelated uncommitted changes in the checkout were retained. No remote publication was performed.
