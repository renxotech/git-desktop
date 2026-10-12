# Review of the test merge into desktop-improvements

Reviewed on 2026-10-12. Merge `0bf7eb86685131be8c3109f2cdffdb98f6d61014`
brings `test` at `29df7ba8581c7bc9074b1b08366649ba152d2e63` into
`desktop-improvements`. The incoming change set is the merge result compared
with its first parent, `c33d799f6a38257945e07d6fda497d1095f00d4b`: 18 files,
552 insertions and 92 deletions. There was no merge in progress during review.

Worktree pinning was committed separately as `8f82598924` (`Add persistent
worktree pinning`). It was already present in the working directory when this
review began and is outside the incoming merge scope. Line references below
use the checkout after that commit.

## Finding

### P2: Bound the repository identity lookups before a Health operation

`app/src/lib/stores/app-store.ts:5487-5491` starts an identity lookup for every
registered repository through an unrestricted `Promise.all`, even when just
one repository is selected for Fetch or Update. Each
`getHealthRepositoryIdentity` call runs two Git subprocesses in sequence
(`app/src/lib/repository-health.ts:116-124`). The later four-worker limit only
applies after all these lookups have finished.

For a large registered repository list, a single selected operation therefore
starts a burst of Git processes across unrelated checkouts. This can exhaust
process resources or delay the operation before the bounded worker queue
starts. Cancellation is also only checked after this initial pass finishes.
The previous first-parent implementation read the registered list directly,
so this preflight fan-out is introduced by the incoming changes from
`44fa10477d`.

Evidence: a controlled probe extracted the current
`_performRepositoryHealthOperation` method with the TypeScript parser,
transpiled it, and ran it with asynchronous fake identity lookups and an
in-memory state cache. With 128 registered checkouts and one selected
repository, it recorded 129 identity calls, a peak of 128 concurrent identity
lookups, and one Health operation. The extra identity call is the selected
worker's revalidation. This verifies scheduling behavior; it is not a native
application benchmark or a measurement of 128 real Git processes.

Recommendation: limit identity discovery with `p-limit` or a small worker
queue, retain the common-directory matching needed to lock linked worktrees,
and stop scheduling lookups when the signal is aborted. A validated identity
cache could also avoid rediscovering every unrelated checkout on each run.

No incoming application source was changed during the initial review. The
finding was fixed in the follow-up below. No additional actionable defects
were found in the reviewed merge.

## Checked behavior

- Health operations lock registered checkouts sharing the selected common Git
  identity, preserve unrelated busy repositories, and release completed
  identities separately from queued identities.
- Folder import and the Health dialog exclude submodules while preserving
  independent nested repositories and common-directory deduplication.
- Generated-directory exclusions match names without regard to case. Their
  discovery tradeoff is explicitly documented in the incoming build guide.
- Installed-editor gating preserves custom-editor actions and exact checkout
  paths. Removed folder groups lose their persisted and in-memory collapsed
  state.
- Unmerged-branch counts use a six-task limit and preserve returned order.
  Error display uses the shared message helper at the changed call sites.
- The development renderer watcher retains startup failure behavior and keeps
  watching after subsequent compilation errors, based on source inspection.

## Validation

All 52 focused tests across 11 suites passed: repository health, Health
locking, folder imports, collapsed-group cleanup, folder actions, Health and
unmerged dialogs, unmerged branches, collapsible filter lists, worktree pins,
worktree dropdown visibility, and aliases. The command was:

```text
node script/test.mjs --test-concurrency=2 app/test/unit/repository-health-test.ts app/test/unit/repository-health-locks-test.ts app/test/unit/ui/add-folder-repositories-test.ts app/test/unit/ui/collapsed-folder-groups-test.tsx app/test/unit/ui/folder-actions-test.tsx app/test/unit/ui/repository-health-dialog-test.tsx app/test/unit/git/unmerged-branches-test.ts app/test/unit/ui/section-filter-list-collapse-test.tsx app/test/unit/worktree-pin-test.ts app/test/unit/worktree-dropdown-test.ts app/test/unit/worktree-alias-test.ts
```

The initial sandbox run passed 32 tests and failed 20 during Git fixture setup
because temporary `.git` writes were denied. The successful rerun used the
same source outside the sandbox; Git remotes in these suites are local test
fixtures. No remote branch was changed.

ESLint and Prettier passed for all incoming TypeScript files. The merge diff
and pinning commit passed whitespace checks. Application TypeScript checking
passed with `--noEmit --skipLibCheck`. The standard `--noEmit` check still fails
with TS2428 conflicts between the installed Lodash `WeakMap` declarations and
the TypeScript standard library.

Validation used the currently installed Node `v22.23.1`; the repository pins
`24.19.0`. No runtime was installed or globally switched. These results are
local source and UI-harness evidence. The app was not rebuilt or relaunched;
native editor launching, live renderer recovery, and remote service behavior
were not exercised.

## Follow-up fix (2026-10-12)

The Health operation now limits registered-checkout identity discovery to four
concurrent lookups using the existing `p-limit` dependency. The limit covers
the entire lookup, including its two sequential Git commands. Selected common
Git identities still determine which registered and linked checkouts are
locked; the existing per-identity release behavior is preserved.

An already-aborted operation returns before discovery. Each queued lookup
checks the signal before launching Git. Cancellation during discovery waits
for the at most four admitted lookups to finish, skips the remaining queued
lookups, and returns before acquiring busy flags or starting Fetch/Update.

Three regression tests were added to `repository-health-locks-test.ts`. They
instrument the real Git `execFile` path with 24 temporary registered checkouts
and one selected repository, check that at most four subprocesses overlap,
verify that cancellation permits at most eight commands from the four
already-admitted two-command lookups, and assert that a pre-aborted operation
launches no Git commands. Cancelled discovery makes no busy-flag changes or
Health result callbacks. The existing linked-checkout locking test remains.

All 16 tests across repository health, Health locking and Health/branch dialog
suites passed. ESLint, Prettier and whitespace checks passed for the fix.
Application TypeScript checking passed with `--noEmit --skipLibCheck`. Tests
used local temporary Git fixtures outside the sandbox because of its `.git`
write restrictions. Node and native-application validation limits remain as
described above. Concurrent progress, SSH and submodule edits were excluded
from this fix.
