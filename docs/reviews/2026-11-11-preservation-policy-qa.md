# Independent backend QA: preservation and disposable-file policy

Accepted backend validation: all **66 defined cases have passing evidence** across the assembled batch and affected retests. This is combined acceptance, not a claim that the final tree was executed as a fresh 66/66 batch. No unresolved actionable backend finding remains.

## Scope and independent assessment

The authorized behavior permits clean differing submodule history or unavailable target history only when the complete private local metadata can be verified and retained before checkout deletion. Missing/corrupt local objects and alternate-dependent stores remain blocked. The root `.safe_to_remove` follows Gitignore matching, including negation, for untracked/ignored files only. Tracked modifications, staged changes and staged gitlinks remain protected. An untracked policy file needs an explicit self-matching rule.

The backend suite preserves prior regressions. Two obsolete expectations change deliberately: missing target history now exercises archival recovery; clean unique local commits move from the blocker loop to a broader recovery case. The missing intermediate local object case now expects preflight integrity refusal, retaining its preservation assertions.

New cases cover local HEAD/private refs/stash/reflog-only commits/unreachable blobs; main-checkout metadata preservation; matched root/submodule outputs without extra ignored consent; anchoring, globstars, character classes, escaped markers, negation exceptions; wildcard refusal for root/submodule tracked state; staged gitlinks; stale policy/metadata; policy-junction refusal; disposable junction target/sibling preservation; corrupt unreachable objects; and external-alternate refusal.

## Validation and limits

Evidence is retained under ignored `tmp/preservation-policy-qa-20261111-142503/`, with unique subdirectories for each run. Both completed batches have identical eighteen-file source/test hashes and HEAD before/after execution. HEAD is `5f0b95f7c27311bf19be540712d54d3a40094184` on `codex/submodule-junction-cleanup`.

- Restricted initial batch: 64 tests, 31 passed and 33 setup failures, 115.4 seconds. Exactly 27 failures were Git MSYS `NtCreateDirectoryObject` access failures; six were Windows junction `EPERM`. This is an environment limitation, not behavior acceptance. The complete diagnostic log and exact snapshot are retained.
- Run 2 with approved normal local access: 65 tests, 61 passed and four failures, 346.1 seconds. Graft routing, stale metadata, tracked/staged/gitlink protection, corruption refusal, ignored/untracked policy semantics, normal retention/restore, existing junction preservation and branch-race/partial-failure cases passed. Snapshot and HEAD remained unchanged.
- Run 3 after the bounded junction classification fix and QA path normalization: 18 affected cases, 17 passed, 85.8 seconds. All four earlier failing cases passed, as did the new target-descendant-only refusal and related junction/policy boundaries. One pattern test completed its assertions but its teardown encountered Windows `EBUSY` on a disposable empty fixture directory.
- Run 4, only that unchanged pattern case: **1/1 passed**, 5.0 seconds. No source edits occurred between Runs 3 and 4. All eighteen source/test hashes and HEAD matched before/after both runs. The two empty fixture leftovers were inspected and removed nonrecursively after their handles were released; no disposable repositories remain. Only Node/tsx compilation caches remain under the owned short fixture root.

Run 3 selected the affected cases through the same repository runner used by npm:

```text
node script/test.mjs "--test-name-pattern=retains a complete private|retains embedded|recovers differing|junction|matching untracked and ignored|gitignore anchoring|negated|GIT_GRAFT_FILE|policy edits" app/test/unit/git/worktree-safe-removal-test.ts
```

Its disposable fixture root was `D:/code/git-desktop/tmp/pqa-preserve-20261111`; logs and source manifests remained in the evidence directory. npm's refusal of the test filter occurred before tests started and is retained separately as `run3/npm-launcher-error.log`.

Final frozen hashes (the complete eighteen-file manifest is in `run3` and `run4`):

| File | SHA-256 |
| --- | --- |
| `worktree-branch-removal.ts` | `db797d60bf1243c4004c67509bc12c5f97ff16e72ddd1b259af8c1a7878a8ba7` |
| `worktree-removal-submodules.ts` | `8d2e09008abcc993fb5697a9a33d09c4898aabe9ebf21ddab6abcdde6d298b14` |
| `worktree-disposable-files.ts` | `0849b80b99ca43a4426908e6ed83cbb153f86433c121a76cf36fd84e70ee553c` |
| `worktree-metadata-backup.ts` | `24dae55a06fe4c25f3ec4cc05c688bf0406122e6f328a12c106bfad2729c63cf` |
| `worktree-safe-removal-test.ts` | `1199c8e90838c4140dbe395ef3ede6478d30bffff5203017ad4691f12fecbdc6` |

Final test formatting, focused available ESLint and test diff whitespace checks passed. The installed unavailable `@typescript-eslint/no-empty-object-type` rule was disabled for the focused lint invocation; no dependency installation occurred. Production owner separately records full TypeScript and production static results.

## Findings and disposition

1. **Accepted/fixed production finding:** Git reports descendants of an untracked Windows junction in its status output. Policy partitioning tried to require the junction ancestor to be ordinary, refusing explicitly authorized link-only cleanup. The initial test failed in `worktree-disposable-files.ts:89` before any mutation. Production classification now stops at the first lexical link and matches only the link itself. A new regression refuses a policy matching only a target descendant. Both pass, alongside registered/ordinary junction preservation and replacement-refusal cases. Independent source review is recorded separately by its owner.
2. **Accepted/fixed QA defect:** the new restore-manifest lookup compared Git forward-slash paths with native Windows paths, causing two recovery assertions to fail after successful archive/removal. Lookup now normalizes both paths; unchanged recovery expectations pass, including actual archived HEAD/refs/stash/reflog-only commit/unreachable-blob reads and full strict fsck.
3. **Informational test-environment issue, resolved for exercised fixtures:** the embedded archive inspection hit Git's filename-length limit because the evidence-directory fixture root was deeply nested. Moving disposable fixtures to the short owned root makes the same recovery assertion pass. This does not establish unlimited production Windows path support; explicit `core.longpaths` or a short recovery location can still be needed for unusually deep archival paths.
4. **Informational teardown issue, resolved:** Windows briefly locked a fixture directory after the pattern test. The unchanged isolated rerun passes; owned empty leftovers were retired. No retry or recovery logic was added to production or the shared test harness.

Acceptance is limited to automated backend disposable Git/filesystem fixtures. There are no active QA processes or ready authorized QA items. Source/tests remain uncommitted and unrelated packaging work remains preserved. No frontend/UI/manual/device tests, builds, app launch, actual user cleanup, commits, push, integration, server access or dependency installation were performed. Cooperative source freezing and identity/hash rechecks do not prove atomic safety against uncooperative concurrent filesystem writers.
