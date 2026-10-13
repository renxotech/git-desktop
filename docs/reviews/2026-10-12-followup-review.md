# Follow-up review: sandbox remediation, test merge, pinning, Git compatibility (2026-10-12)

Scope: `desktop-improvements` at `9126b57`, commits since `2e5c746` that are not upstream `development` merges:

| Commit | Change |
| --- | --- |
| `4ddd6aa` | Open selected checkout in Debian-WSL1 with literal path handling |
| `564798e` | Guarded sandbox fast-forward rules and worktree aliases (includes the 2026-10-11 remediation R1–R5) |
| `0bf7eb8` | Merge `test` (review fixes `cb4f55e`, `cbb9956`, `44fa104`) |
| `8f82598` | Persistent worktree pinning |
| `c4a249a` | Compatibility with current Git, LFS and OpenSSH output |
| `9126b57` | Bound repository-health identity discovery |

Read alongside `2026-10-11-sandbox-rules-remediation.md` and `2026-10-12-test-merge.md`. Source read only: nothing was built, launched or tested for this review. The working tree is clean apart from the untracked `node_modules.junction-backup-20261001`.

## Status of the 2026-10-01 findings (S1–S10)

The remediation's R1–R5 came from a separate independent review and only partly overlap S1–S10.

| # | Finding | Status at `9126b57` |
| --- | --- | --- |
| S1 | WSL hard-codes `Debian-WSL1` | **Kept by decision** (see `2026-10-03-open-in-wsl.md`). Correct for this machine; Open in WSL still fails on any other. |
| S2 | Commit box disabled with message on every mount | **Partly addressed.** Initial text is now "Checking sandbox protection…", so the flash is explained, but it still appears in every repository, rules or not. |
| S3 | Invalid rules config blocks normal work | **Partly addressed (R3).** Worktrees stay visible and Settings offers backup-and-reset. Mutation guards still reject every protected command until reset, by design. |
| S4 | Short branch-name matching too broad | **Fixed (R2).** See note G1 below. |
| S5 | Fetch with rules bypasses `gitStore.fetch()` | **Open.** `_fetch` still uses `fetchRemotes(…, false, …)` when rules exist (`app-store.ts` ~6145). |
| S6 | Two extra Git processes per protected command | **Open.** No rule cache in `sandbox-rule.ts`. |
| S7 | Pull silently becomes Fetch | **Open.** Menu and shortcut still say Pull. |
| S8 | Unauthenticated release-API fallback | **Open.** `sandbox-release-loader.ts` unchanged. |
| S9 | `String(error)` in UI errors | **Open and wider:** `sandbox-rule-dialog.tsx` (6 sites), `repair-worktrees-dialog.tsx` (2). Use `errorMessage` from `repository-health.ts`. |
| S10 | Conflict with `test` branch | **Resolved** by merge `0bf7eb8`. |

## New findings

### G1. Push guard blocks pushes to a remote branch that shares the sandbox's name (minor)

`assertSandboxMutationAllowed` treats either side of a push refspec as a target. `git push origin feature:main` from another worktree is blocked when local `main` is a sandbox, although only the remote branch is written. Wildcard refspecs are also blocked repository-wide.

Fix: match only the source side (`src` of `src:dst`, or the whole refspec when there is no colon) against protected local branches, and only treat `--all`/`--mirror`/wildcards as targeted when the source pattern can match a protected branch.

### G2. Pinning stores state per path in localStorage (minor)

`worktree-pin.ts` mirrors `worktree-alias.ts`: keys survive external `git worktree remove` and prune, and are not shared across machines or profiles. Same tradeoff as aliases; acceptable, but a stale key will re-pin a new worktree created at the same path. Clear pins and aliases for paths no longer listed when `_refreshWorktrees` runs, or accept and document it.

### G3. Pinned main worktree drops its "Main" label (minor)

`worktree-list.tsx` moves a pinned main worktree into the Pinned group and omits the Main group, so nothing marks which pinned entry is the main checkout. Keep a "main" badge or description for it.

## Retracted from the 2026-10-01 test-branch review

The suspected race between the busy check and lock acquisition in `_performRepositoryHealthOperation` does not exist: the check and the lock updates run in the same synchronous block after identity resolution. The unbounded identity lookups were real and are now fixed in `9126b57` (`pLimit(4)`, abort checks before and after).

## Looked correct

- **R2 guard:** commit messages and filenames no longer match; `branch`/`update-ref`, `worktree remove/move` paths, `checkout -B/-C` and push refspecs (including `+` and deletions) are inspected.
- **R1/R5:** branch rules fetch their exact source into isolated refs before resolving, and submodule completion is retried with recorded HEADs and cleanliness checks.
- **`9126b57`:** identity discovery bounded at 4, abort honoured, linked-worktree matching kept.
- **`c4a249a`:**
  - Submodule status parsing handles uninitialised and conflicted entries.
  - `describe` is now nullable, and no consumers read it.
  - Progress aliases cover "Compressing objects by path" and "Updating files" without letting the percentage go backwards.
  - The OpenSSH prompt regex accepts the `fingerprint is:` form.
- **`8f82598`:** pins clear on remove and move with the worktree, like aliases.

## Remaining work

- [ ] S5 unify fetch path when rules exist
- [ ] S6 cache rules for the mutation guard
- [ ] S7 relabel or disable Pull for sandbox branches
- [ ] S9 replace `String(error)` in the sandbox and repair dialogs
- [ ] S2 hide the checking message unless rules exist
- [ ] S8 sign-in hint on unauthenticated release failures
- [ ] G1 restrict push matching to the source side
- [ ] G2 prune pin/alias keys for vanished worktrees, or document
- [ ] G3 keep a Main marker on a pinned main worktree
- [ ] S1 make the WSL distribution configurable before sharing builds
- [ ] Native launch, WSL window and hot-reload checks (still not performed by any review)
