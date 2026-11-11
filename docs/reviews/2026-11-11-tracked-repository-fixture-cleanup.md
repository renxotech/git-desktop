# Committed repository fixture cleanup false positive

## Diagnosis

The user's removal screenshot reports `Nested bare repository prevents cleanup: app\test\fixtures\branch-prune-tests\_git`. The existing detector rejects any ordinary directory containing `HEAD`, `objects` and `refs`. That recognizes the shape of this repository's committed test fixtures as well as genuine nested repositories. Outer Git tracks the named fixture's files, including object database, refs, reflogs, index and config; targeted status is clean. The fixture attribute `-text` preserves exact committed bytes. No actual worktree removal was performed during diagnosis.

## Implementation and disposition

Accepted/actionable false positive, corrected with a generic committed-data proof, without a path/name allowlist. The same bounded proof applies to directory-shaped `.git` metadata and bare-repository shapes; file/link `.git` markers remain blocked outside recognized submodules.

`isCommittedRepositoryData` derives the expected subtree from the exact selected branch commit using literal pathspecs and NUL-delimited tree records. Every expected leaf must be an ordinary blob. The index must contain exactly the same stage-zero modes and blob IDs. A separate Git diff rejects staged/unstaged changes. Complete filesystem inventory must contain exactly the expected ordinary files and necessary parent directories; links, gitlinks, special entries, untracked/ignored extra leaves and extra empty directories fail closed. Finally, each physical file is read and hashed as a Git blob, independently requiring exact committed bytes (SHA-1 or SHA-256 according to the tree object IDs). This also prevents a misleading clean status or nested repository boundary from hiding local object/ref/index/config changes.

These checks permit unchanged source data already retained in the merged outer commit. They do not authorize removal of genuine nested repositories containing additional local state. Existing main/current/locked checks, branch/target ancestry, complete inventory revalidation, per-entry identity guards, metadata retention and nonrecursive link-safe cleanup remain in force.

## Source and validation limits

Isolated branch/worktree: `codex/submodule-junction-cleanup`, tracking `origin/desktop-improvements`, `D:/code/git-desktop/.worktrees/submodule-junction-cleanup`; starting HEAD `297594d3c229620ef75c88cf0cd744e83a339214`. Implementation is uncommitted. No real user cleanup, main-checkout edits/dependency changes, integration, build, launch or push is authorized.

Coder static checks and independent source/backend QA are pending at the initial code-written checkpoint. QA must cover the exact real fixture plus dirty/staged/extra-data variants and genuine nested-repository rejection, with existing preservation tests. UI/browser/manual tests are excluded. Raw-byte mismatch from checkout text/filter conversion is conservatively blocked, even if ordinary Git status regards the converted bytes as clean. Path-based mutation concurrency limits from the original cleanup review remain unchanged.

Frozen source handoff: focused formatting/ESLint and `git diff --ignore-submodules=all --check` passed. Full application TypeScript (`--noEmit --skipLibCheck`) reports only `app/src/main-process/notifications.ts:20,33` (`void` is not assignable to boolean); this file has no diff from the starting HEAD and remains outside the fix. No diagnostics point to this chunk. Coder did not execute tests. Independent QA and review are pending.

SHA-256 source identity: `worktree-branch-removal.ts` `4cfe0cbac16a239ea3ebb5820a12e85697a4f1101ab328acf01e2a14d1709fea`; new `worktree-cleanup-repository-data.ts` `9b58571d4ef1e75e81a126690e14a4fddd36ec89e798d5f53d1f6560faa7986a`.

## Final independent backend acceptance

Accepted: **34/34 automated backend tests passed, zero failures/skips**, approximately 117 seconds. Nine new regressions use the actual `app/test/fixtures/branch-prune-tests/_git` data copied into a disposable parent, committed with raw-byte attributes, then checked out through Git into its selected disposable worktree. Clean committed data permits actual disposable worktree/branch removal while preserving its main copy. Modified tracked, staged tracked, staged-new, untracked-extra, ignored-extra and extra-empty-directory variants reject cleanup. Genuine fresh untracked and ignored bare repositories remain blocked.

All original 25 cases remain passing, including Windows top-level/nested junction targets, submodule archives/recovery, stale plans, sandbox/assisted guards, branch compare-and-delete and partial failures. No production defect was found in the bounded fix; independent source review accepted the generic exact-blob proof.

Exact command from this isolated worktree:

```text
npm test -- app/test/unit/git/worktree-branch-removal-test.ts app/test/unit/git/worktree-safe-removal-test.ts
```

`TEMP` and `TMP` pointed to ignored `tmp/tracked-fixture-qa/fixtures`. Approved normal local access avoided known managed local Git/MSYS restrictions. The harness retired all disposable repositories/worktrees; only Node/tsx compile caches remain. Production/test hashes matched the frozen manifest afterward. Test hash: `2480cd98d687629270135d3b887f0f89046223c6be2a87ff180e0bcd9226d02f`; production identities are above. Manifest, source diff/new-helper copy and logs remain in ignored `tmp/tracked-fixture-qa/`.

Focused formatting/ESLint and diff checks passed (only the known unavailable installed ESLint rule disabled). Independent full TypeScript repeats only unchanged `notifications.ts:20,33` diagnostics noted above; that file has no source diff, and no diagnostics identify this fix/tests. Full TypeScript is therefore limited by the unrelated current-HEAD errors.

Changes remain uncommitted on `codex/submodule-junction-cleanup`, upstream `origin/desktop-improvements`, HEAD `297594d3c229620ef75c88cf0cd744e83a339214`. Existing `app/static/common/gitignore` submodule state and other review work were preserved. No real user worktree removal, dependency target changes, build, launch, integration, commit or push occurred. UI/browser/manual tests and adversarial concurrent-filesystem guarantees remain outside acceptance. No active operations or unresolved actionable QA finding remain.
