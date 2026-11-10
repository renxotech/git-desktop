# Smarter worktree cleanup - 2026-11-10

## Outcome and source review
- User screenshot showed dependencies/build artifacts and an unrelated shared stash preventing removal. Accepted: blanket ignored-file/stash blocking was too broad. Supersedes previous blocking design.
- Status is parsed with NUL delimiters into tracked changes, untracked files and ignored paths. Tracked/untracked changes remain blockers and paths are shown. No folder-name allowlist or deletion based on a guessed filename.
- Ignored paths are shown separately with an unchecked explicit deletion consent. They can include generated folders or important local configuration. Without consent backend refuses ignored cleanup.
- After revalidation, cleanup verifies absolute Git worktree root and relative paths, then uses literal pathspecs with Git clean -fdX only for the reviewed ignored paths. No whole-worktree force removal. New ignored paths require renewed review; tracked/untracked changes and branch/target movement are checked again after cleanup. Nested repositories or files Git cannot clean cause removal to stop.
- Shared stashes are informational and preserved, with UI explaining they remain applicable from another worktree. Branch removal does not call the normal branch deletion helper that can remove app-associated stashes.
- Independent source assessment: no unresolved actionable findings in scope. Recognized limitation: generated artifacts not covered by ignore rules remain untracked blockers; users must add appropriate ignore rules or move them. Also directory-level consent covers the displayed directory contents, as explained by folder paths.
- Preserve local-only default: Include remote branches starts unchecked in both views.

## Validation
- 21/21 focused tests passed (worktree-branch-removal, unmerged-branches, repository-health-dialog, group-branches). Tests cover explicit ignored-file consent, actual disposable node_modules/dist cleanup, ignored local configuration visibility, changed ignored-path rejection, preserved stash after actual removal, dirty files and lazy UI checks.
- TypeScript skipLibCheck and focused ESLint (known unavailable rule disabled) passed. No actual project worktree cleanup, commit, build or launch for this request. Prior package still has earlier cleanup behavior.

## Source SHA-256 checkpoint
- desktop-improvements, HEAD 5011348256fd99104d3615b68e7d066595e9e154 plus uncommitted files below.
- app/src/lib/git/worktree-branch-removal.ts: ee7872ce0b644aa4d4a9ae0d032c7b0aeda4e5094c5f7de07235e81a3e79f4a4
- app/src/lib/stores/app-store.ts: 0f47f01f5e84fb4d074247cd2d7f5eefb77a471ae71e8061a47b91db330830b9
- app/src/ui/dispatcher/dispatcher.ts: e4b384d482fd585b3647ad6a63367f09abad297c3aacfff75d6767fc28f59878
- app/src/ui/branches/unmerged-branches-dialog.tsx: 78a42a7b1acf6e1b7b08f40bf764b605402c283147e98b43493fde283a29c184
- app/test/unit/git/worktree-branch-removal-test.ts: b7a3bb16f4ed4e8d28a5da116edce92281a5c232c2db859aa7ab0129af0d2ba3
- app/test/unit/ui/repository-health-dialog-test.tsx: 8071e3c00a74976b454f811840a6f2c1ed2aacf4995031edb3e529bba5a776fd
