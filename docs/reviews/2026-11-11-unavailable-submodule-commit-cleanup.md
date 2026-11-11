# Unavailable submodule commit during removal preview

## Local diagnosis

The supplied screenshot selects `codex/submodule-junction-cleanup` and shows `fatal: Not a valid commit name ebcf0afa6af624bf59c3d3b674b744b029835a1e`. At isolated source HEAD `cf2bdb187266d450ba7ffe91db172b845ce079c9`, target `desktop-improvements` records that exact gitlink at `app/static/common/gitignore`. The selected initialized submodule's HEAD is the available commit `8ba69a4220df77b696fe97b60fb70eb668fb00e1`, while local `cat-file` cannot resolve the target commit. Quiet commit verification returns exit 1 for that unavailable target and exit 0 for the local HEAD. The selected clone reports it is not shallow. Its metadata is dedicated to this worktree.

The existing checker sends both revisions straight to `merge-base --is-ancestor`, which exits fatally when the expected target object is absent. That aborts the whole preview before the user can see the module/path-specific explanation. This finding is accepted/actionable. Local object unavailability does not establish whether upstream lacks the revision, identify authorship of the selected HEAD, or authorize history acquisition/repair.

Diagnostic access was local/read-only. The targeted commit-availability probes used `GIT_NO_LAZY_FETCH=1` and `GIT_OPTIONAL_LOCKS=0`; this does not assert those flags were used for every initial listing/status diagnostic. No actual worktree, metadata, dependency or object data was changed; no fetch, reset, hydration, commit, build, launch, push or server access occurred.

## Bounded implementation

- Resolve local HEAD and explicitly verify HEAD/target as available commit objects before ancestry comparison. Quiet verification exit 1 means the requested commit cannot be resolved; unexpected operational failures remain failures rather than being mislabeled missing.
- Return typed per-module issues (`head-unavailable`, `target-unavailable`, `ancestry-unproven`, `history-unavailable`) carrying path, required revision and an actionable message. Existing `blockers` strings also contain those messages, so the current preview renders them without a separate UI flow.
- An unavailable target explains its full SHA and selected submodule path, asks for the required local history to be made available separately, and states that no automatic fetch/repair is performed. A missing/broken HEAD is likewise blocked, and HEAD-dependent status/cached-diff commands are skipped.
- Skip recursive target-tree inspection when the initialized parent's HEAD or target is unavailable; otherwise it would fail again while reading a nonexistent target tree. The containing submodule stays blocked, so this cannot authorize deletion of uninspected nested state.
- Available-but-unproven ancestry remains blocked. Exit 1 no longer asserts definitive unique commits because incomplete history can hide inclusion. Fatal history-read/access failures return a distinct blocked history issue and retain both revision IDs in the explanation.
- Local submodule/read-helper Git commands disable lazy object fetching and optional index writes. No revision is copied, fetched, reset, ignored for removal, or assumed to be merged merely because comparison failed. The backend still revalidates and refuses any plan with blocked submodule paths.

## Validation checkpoint and limits

Production change is isolated to `app/src/lib/git/worktree-removal-submodules.ts` on `codex/submodule-junction-cleanup`, tracking `origin/desktop-improvements`; changes are uncommitted. Focused formatting/ESLint, application TypeScript `--noEmit --skipLibCheck`, and whitespace checks passed. Coder did not execute tests. Independent review and backend QA are pending at this checkpoint; they must cover unavailable target/HEAD, incomplete or unreadable history, no automatic fetch/repair, safe removal refusal and normal available ancestry behavior. UI/browser/manual tests remain excluded.

Actual history recovery is outside this fix. The selected user's worktree remains blocked until separately authorized work makes its history verifiable; improved reporting does not establish deletion eligibility. Ordinary path-based concurrency limits of the original cleanup implementation remain unchanged.

Independent source review accepted frozen source SHA-256 `c255831a96ebc5267cf1b2f651355252100dad8ce765adf4233b8742cc24f60a`, verifying fail-closed classifications, expected-absence/operational-error distinction and local-only read behavior. No unresolved actionable source finding remains. Backend QA execution remains separate and pending.

## Final backend evidence and source reconciliation

Four new real disposable-module regressions pass: an outer target gitlink points to a commit from an independent second repository which is absent locally; an initialized module has an unborn/unavailable HEAD; an available descendant target retains normal ancestry/removal eligibility; and endpoints exist but an intermediate history object is missing. The original unique-commit case now also asserts `ancestry-unproven`. Missing-target/HEAD/history cases return typed blockers and refuse removal. Tests verify no fetch command, no lazy fetching/optional writes on the revised quiet commit probes, unchanged module HEAD/index bytes and checkout content, and that the absent target object remains absent. No user object was fetched, copied or repaired.

The original `c255831...` scoped freeze was superseded before execution by a separately owned registered-submodule-junction correction. Its helper change adds linked-root classification/target text and ordinary-ancestor proof; the missing-history logic remains present. That combined helper is `454ea59f0b3a970afe9b905cd699ba177ea2bca42f5a02e82dce1ae02dd0268c`. Combined test SHA-256 is `603cb311ba632d6505dca545c3b730dd5298291702836024882c81f2e9ffa162`.

The first assembled run passed **41/41** in approximately 211 seconds, but its initial test manifest predates six extra junction assertions: production last-write 13:28:44, saved manifest/patch 13:29:31, final test edit 13:29:47, log created 13:29:48 and completed 13:33:20, local time. The saved production patch matches current source. These observed edits predate the run, but this run is supplemental evidence rather than a claim that the original scoped freeze stayed unchanged. Its log/manifest/patch/TypeScript output were preserved without overwriting the originals in unique ignored `tmp/unavailable-commit-qa-20261111-133320/`.

Definitive combined backend acceptance reuses the independently retained [registered-submodule-junction QA receipt](2026-11-11-submodule-root-junction-qa.md): **41/41 passed, zero skips/failures, 233.8 seconds**, with all nine source/test hashes and HEAD verified unchanged before/after. Its manifest, exact source copies, dirty diff, post-run hash comparison and log in `tmp/submodule-junction-qa/` include all four missing-history regressions. Current helper/test hashes match that exact run. This avoids duplicating a completed stable run. The later source-reviewed UI wording change affects no backend behavior and supplies no UI runtime acceptance.

Command for both focused backend batches:

```text
npm test -- app/test/unit/git/worktree-branch-removal-test.ts app/test/unit/git/worktree-safe-removal-test.ts
```

Runs used approved normal local access and separate ignored task `TEMP`/`TMP` fixture roots. Disposable repositories/worktrees were retired by the harness; only Node/tsx caches remain. Focused formatting/ESLint, application TypeScript `--noEmit --skipLibCheck` and whitespace checks passed. No unresolved actionable backend finding remains; source review covers the original missing-history fix and separately reviewed junction delta. Branch remains `codex/submodule-junction-cleanup`, upstream `origin/desktop-improvements`, HEAD `cf2bdb187266d450ba7ffe91db172b845ce079c9`, source/tests uncommitted. The user's real module still lacks the required history and remains blocked; history acquisition/repair and actual cleanup were not authorized or performed. UI/manual tests, build, launch, commit, integration and push remain excluded.

Subsequent combined source review found two new acceptance gates beyond the original missing-history logic: inactive metadata ownership can be routed through a registered junction into an external live checkout, and absent nested submodule parents can cause a raw ENOENT. Both are accepted/actionable and assigned for narrow production correction plus two independent backend regression fixtures. The 41/41 receipt remains evidence for its exact pre-fix source; final combined acceptance is pending those corrections and affected validation. No further test run has started at this checkpoint.

## Final combined safety closure

The two subsequent source findings are accepted/fixed and independently reviewed. Inactive metadata owners must now have ordinary existing ancestors before ownership lookup/archive. A lexical path through a registered junction is ambiguous even when a stale private store looks harmless: the checker refuses both stale and externally live cases without reading the external target to disambiguate them. This deliberately narrows link-only cleanup eligibility; users must resolve ambiguous ownership separately. Successful junction cleanup remains supported when no ambiguous inactive store is in the selected administration container. The positive fixture preserves its setup-only private store intact outside that container before review; it does not discard metadata to make application cleanup appear safe.

For uninitialized nested gitlinks, absent parent directories are now allowed only in the specific ancestor-verification calls. Existing ancestors must still be ordinary directories. Strict cleanup/inventory roots remain unchanged; an existing junction ancestor is still rejected.

Final acceptance: **43/43 automated backend tests passed, zero skips/failures, 218.2 seconds**. The two added regressions exercise both stale/external-live ownership rejection with unchanged target/metadata snapshots, plus absent nested-parent classification and real disposable removal while still rejecting a linked ancestor. All four missing-history cases and all earlier preservation regressions pass. Full TypeScript `--noEmit --skipLibCheck`, focused test formatting/ESLint and diff checks passed. No unresolved actionable source/backend finding remains for the agreed scope.

Unique final evidence is in ignored `tmp/history-owner-qa-20261111-final/`: six-file pre/post manifests, exact source/test copies, original/base-relative dirty patches, beginning/ending HEADs, backend and TypeScript logs. Every captured source/test hash matched before/after:

| File | SHA-256 |
| --- | --- |
| `worktree-removal-submodules.ts` | `b09d0882b1d3fbfa0f831b1805adf656a607a53d5bfe03a2cd02b5a530901684` |
| `worktree-cleanup-files.ts` | `280b728132a4ea79d64c2ade95e82028d384fd8cf3ea398a156e005d7d0d7c67` |
| `worktree-branch-removal.ts` | `989d07e6743987cdc9cc26b73e3998f5d6a2b0a0507c99cc39d9b6dc1a3d4e02` |
| `unmerged-branches-dialog.tsx` | `ae3cac3e61d59be6f5e20df047f5c58871b8517e4de170e068064b2e74f93d66` |
| `worktree-safe-removal-test.ts` | `562ddd2dc54fe51045addfd4c47f57d2cc3c94a0dc5a99b67ff0a3f3959592fc` |
| `worktree-branch-removal-test.ts` | `b7a3bb16f4ed4e8d28a5da116edce92281a5c232c2db859aa7ab0129af0d2ba3` |

HEAD changed during this run from `cf2bdb187266d450ba7ffe91db172b845ce079c9` to separately owned local commit `9668e831988873af0e9b498f8e6a3cf109ce52d8` (13:43:08), while all six tested file bytes remained identical. The commit touches only the captured submodule helper, UI and backend test paths plus the source-review document; no other runtime dependency/source path changed. Acceptance therefore identifies the captured dirty source manifest, not a claim that HEAD stayed fixed. Current three backend corrections and test adjustments remain uncommitted on top of that commit; the separately owned commit is not attributed to this QA task.

No extra test rerun was needed for an index/commit change that preserved all tested bytes. The normal-access harness retired its disposable repositories/worktrees; only compilation caches remain. No actual user worktree/object/dependency target was altered by QA, and the real unavailable-history condition remains blocked without repair/fetch. No build, app launch, new commit, integration or push was performed by this task. UI runtime/manual testing and uncooperative concurrent-filesystem guarantees remain excluded.

## Final combined ownership/ancestor correction checkpoint

P1 is accepted/fixed: inactive metadata core.worktree can lexically appear inside the selected checkout while an existing component routes it through a root junction to live external metadata. The scan now proves ordinary existing owner components before Git worktree lookup or archival. Linked/invalid/unreadable ownership yields a contextual private-metadata-ownership blocker; the archive and selected/target state remain untouched. Parent explicitly accepts conservatively blocking stale-store ambiguity too, since target .git inspection is excluded. Links without ambiguous inactive stores remain supported.

P2 is accepted/fixed: a nested gitlink can have missing uninitialized parent directories. Only the gitlink-parent and contained inactive-owner checks now explicitly permit ENOENT while recursively checking all existing components first. Linked/dangling-linked ancestors still block, and cleanup roots/archive sources/deletion parents retain strict default checks. No target .git, target history or target objects are read by this owner proof.

Final correction source hashes: worktree-removal-submodules.ts b09d0882b1d3fbfa0f831b1805adf656a607a53d5bfe03a2cd02b5a530901684; worktree-cleanup-files.ts 280b728132a4ea79d64c2ade95e82028d384fd8cf3ea398a156e005d7d0d7c67; worktree-branch-removal.ts 989d07e6743987cdc9cc26b73e3998f5d6a2b0a0507c99cc39d9b6dc1a3d4e02. Existing UI ae3cac3e61d59be6f5e20df047f5c58871b8517e4de170e068064b2e74f93d66 was preserved. Formatter/focused ESLint/full TypeScript/whitespace checks pass; coder ran no tests.

Independent assembled source review PASSES these exact hashes, confirming ancestor-first checks, ENOENT-only opt-in behavior in the two intended callers, private-owner refusal before lookup/archive, and unchanged strict mutation checks. No unresolved actionable source issue remains. Final affected backend QA remains pending; prior 41/41 evidence is retained only for its recorded earlier snapshot. Production source is frozen; all changes remain uncommitted, with no actual user cleanup, repair, build, integration, push or launch.
