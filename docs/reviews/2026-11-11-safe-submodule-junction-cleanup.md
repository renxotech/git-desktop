# Safe submodule and junction cleanup

## Scope and source

Implementation requested after the 2026-11-11 file-history worktree investigation. Work is isolated in `codex/submodule-junction-cleanup`, tracking `origin/desktop-improvements`, based on `d95892e06f3290f4aa97a12a7b9869470cd7258a`, at `D:/code/git-desktop/.worktrees/submodule-junction-cleanup`. No actual user worktree cleanup, commit, integration, push, build or app launch is authorized by this implementation task.

This supersedes the Git-clean execution approach in [the previous cleanup review](2026-11-10-smarter-worktree-cleanup.md). Shared stashes, current/default/main branch protections, merged-tip checks and explicit ignored-file consent remain enforced.

## Implemented behavior

- Read every submodule recursively. Show clean, uninitialized, incomplete missing-index/empty-checkout, and blocked states separately. Missing indices do not establish intentional staged deletions; incomplete checkouts require explicit submodule-removal consent.
- Block real staged/modified/untracked/ignored submodule files and HEAD commits outside the selected target's recorded submodule commit. Include a separate cached diff for every initialized submodule so staged nested gitlinks are not hidden by the status setting used for recursion.
- Reject active Git operations, hidden index flags, nested repositories, nested bare repositories, root/ancestor links, ambiguous metadata ownership and shared submodule Git directories. Verify selected branch, commit, root, caller common directory and administrative backlink.
- Retain the whole dedicated modules container and any embedded submodule Git directories outside the worktree administration directory. This preserves refs, stashes, reflogs, object databases and inactive-module state rather than relying on HEAD ancestry to establish disposability. Metadata containing filesystem links or relative object alternates is blocked. Absolute alternates keep their original target; targets are never changed.
- Require separate unchecked consent for submodule checkout removal and metadata retention. Show the retained-metadata parent directory before removal and the exact generated directory after successful removal.
- Inventory all selected checkout entries with `lstat`, without descending through junctions/symlinks or preserved metadata. Compare the reviewed inventory, branch/target tips, submodules and ignored paths at action time; repeat full validation before mutations.
- Remove each checked file/link with `unlink`, and each checked ordinary directory with nonrecursive `rmdir`. Verify ancestor directories and entry identity just before each mutation. Never use Git clean or recursive filesystem removal on working files. Replaced entries and newly populated directories stop cleanup.
- After the checkout root is absent and retained metadata moved away, recheck registration/lock state and the remaining administration directory. Only then ask Git to remove the absent checkout registration with force. Branch deletion uses compare-and-delete and rechecks target/checkout state. Failures report partial progress and retained metadata locations; they preserve the branch.

## Metadata recovery

Each removal with metadata creates `<common-git-dir>/desktop-worktree-metadata-backups/<uuid>/restore.json`. It records the original worktree, branch, source commit and exact original-to-saved directory mapping. Each numeric child is an intact moved Git directory or modules container. No backup is automatically deleted.

The manifest also records each submodule's path, Git directory, HEAD, target and original `.git` pointer text for file-backed modules. Embedded `.git` directories are retained whole. Native primary-object routing must remain inside that retained store's own `objects` directory; environment redirects fail closed. Transitive alternates may point only to verified surviving external object directories.

For recovery, first preserve any current work at the original locations and inspect the manifest. Recreate the original checkout at the recorded commit and restore each saved directory to its exact original location only when that destination is absent and ownership is confirmed. Original `.git` pointer and `core.worktree` relationships work when their original layout is restored. Recreate the submodule pointer files using the recorded original metadata locations if needed; do not reset or overwrite working files. The retained original Git config and absolute alternates remain intact. To inspect a saved module without restoring its checkout, supply both `--git-dir=<saved-module-dir>` and an explicit existing `--work-tree=<inspection-folder>` when invoking Git. Recovery is documented, not automatically executed.

## Independent review dispositions

- Accepted/fixed: recursive status alone hid staged nested gitlinks; added per-module cached diff with submodule changes included.
- Accepted/fixed: selected checkout ownership lacked caller common-directory, symbolic branch and administrative backlink proof; added all three checks.
- Accepted/fixed: successful removal initially exposed only the retention parent; return the actual archive directory through AppStore/Dispatcher and display it after success.
- Accepted/fixed: inactive module containers can serve external linked worktrees; inspect their registrations and reject shared metadata before moving the container.
- Accepted/fixed: alternate object paths can be disposable or alias deleted objects through a junction; reject relative paths and both lexical/physical alternate targets inside the selected checkout or administration directory.
- Accepted/fixed: direct alternate files omit transitive object dependencies; query Git's native `count-objects -v` graph for every retained initialized/inactive store and apply the same physical/lexical checks to the entire alternate graph. Ambiguously quoted graph paths fail closed.
- Accepted/fixed: native alternate output omits the primary object directory; query `rev-parse --path-format=absolute --git-path objects` and reject primary-storage redirection before cleanup.
- Accepted/fixed: direct filesystem mutation must inherit existing Git operation protections before touching files; reserve destruction/mutation lifetimes, enforce assisted-commit/read-only restrictions and existing sandbox worktree/ref protections before cleanup.
- Independent source review and automated backend QA are complete. Review findings were accepted/fixed; no unresolved actionable issue remains. See the [independent QA receipt](2026-11-11-safe-worktree-removal-qa.md) for exact source, all 25 passing backend cases, evidence and limitations.

## Validation and limitations

Initial implementation static checks: application TypeScript `--noEmit --skipLibCheck` and focused ESLint passed. ESLint disables only the known unavailable installed `@typescript-eslint/no-empty-object-type` rule. Targeted formatting/fix checks avoid unrelated repository-wide changes. Coder did not execute tests. Independent QA owns real disposable Git/submodule/junction fixtures; UI/browser/manual tests are excluded by instruction.

Second frozen handoff after accepted review fixes: TypeScript, focused ESLint and `git diff --check` passed again. `worktree-branch-removal.ts` SHA-256: `c75abee79f2385d00213a7632bc3a693e45543a97ef03b66acb4361ad65bd96c`; `app-store.ts`: `9b8daeb9b5e36da3a078933a51cc2e1a536840d8711777c6be74823a1a033c43`. Independent QA owns the active source manifest and test report for the assembled dirty checkout.

Third frozen handoff supersedes the two changed source hashes above: backend `d7be14feb92d54a9df70824298ec66e63fa825cc99260906185572e3acbe9898`; `worktree-cleanup-files.ts` `84f3b50b031c42466da2dace31ef399159f1dea1b8e9db194ebd6397a9922af8`. TypeScript/focused ESLint/diff checks passed. Directory snapshots compare object identity and exact descendant inventories, so timestamp-only churn from a completed stash cycle does not reject a clean unchanged directory. File/link snapshots retain size/times/identity and link target comparisons. The original shared-stash preservation invariant remains under independent QA.

Final implementation handoff supersedes the backend hash above: `5093aaeba8e0b31b2e94840de3addb06ded5b8240042d23de5f5eb30ba578fc0`. Primary-object routing and explicit `.git` pointer recovery records are complete; static checks passed again. The latest independent test batch had 22/24 passes with two fixture-construction failures and no production-code failures; QA is correcting fixtures and rerunning the focused backend batch. This is not yet a final passing-test receipt.

Final independent QA supersedes the pending receipt above: **25/25 backend tests passed with zero skips/failures**, plus TypeScript/focused ESLint/diff checks. Real Windows junction and nested-link tests preserve disposable main-checkout dependency targets, tracked checkout contents and sibling files. Clean/incomplete metadata restoration recovers local refs, stashes and usable checkouts; embedded metadata remains readable. All six production hashes matched the frozen source manifest after the run. No actual user worktree, dependency target, or main-checkout content was deleted or changed by QA. The [QA report](2026-11-11-safe-worktree-removal-qa.md) records exact commands, hashes, source evidence, setup/fixture failures and their resolutions.

All operations use ordinary path-based Node/Git APIs. Checks detect changes before mutations and per-entry replacement, but cannot claim atomic exclusion of an uncooperative external writer between a path check and the following operation. In particular, the final Git command follows a last absent-root check. No claim of adversarial concurrent-filesystem safety is made. Users should stop writers in the selected checkout before removal; partial cleanup errors require fresh review rather than automatic retry. UI/browser/manual tests, packaging/build, launch and actual user cleanup remain excluded.
