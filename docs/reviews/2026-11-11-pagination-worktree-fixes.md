# Pagination and worktree fast-forward fixes — 2026-11-11

## Authorized chunk and snapshot

User authorized both remaining fixes after runtime diagnosis: migrate the owned
pagination parser and prevent automatic fast-forward of any checked-out branch,
including a checkout race. Source worktree remains
`D:/code/git-desktop/.worktrees/notification-initialization`, branch
`codex/notification-initialization`, starting commit
`c31e726db240980d93979de882223bf8db1c1b64`. A local commit was subsequently authorized; no push, production package
build or app launch authorized. The user's running diagnostic package remains
unchanged. Unrelated `.gitignore` and local evidence are preserved.

The runtime evidence and original findings are recorded in
[runtime trace findings](2026-11-11-runtime-trace-findings.md). R3/P3 and R5/P2
implementation-pending scope in that historical review is superseded by this
explicit implementation request, limited to this chunk.

Finite acceptance criteria:

- The traced API Link and page-size-growth flow uses WHATWG URL without warning
  suppression, preserving path/query meaning, encoded values, duplicate query
  controls and the existing growth schedule; malformed/opaque Link targets are
  rejected safely. No repository-wide parser migration.
- Discovery and actual fast-forward mutation exclude every branch held by a
  worktree. Inventory failure stops mutation; sandbox filtering remains.
- A branch checked out after inventory is protected by Git's own guard. Only its
  exact submitted-ref refusal is handled nonfatally; remaining eligible refs
  continue after fresh inventory. Genuine/unrelated errors still propagate.
- No force, update-head-ok or user worktree/ref mutation by agents. Validation
  uses only automated process/backend cases and disposable Git fixtures.

## Implementation and rationale

`app/src/lib/api.ts` replaces the two legacy pagination parse operations with
WHATWG URL. The placeholder origin is parsing-only; the API client remains the
request destination. Links return pathname plus query without fragments. Only
HTTP(S) URL targets are accepted; invalid URLs return null. Link extraction does
not split commas contained inside a URL target. Page/per_page duplicates still
skip growth, matching the old array-valued parser semantics. URLSearchParams
preserves unrelated duplicate values while updating the two growth controls.
The second parse preserves double-slash pathnames rather than reinterpreting
them as a different authority.

Independent review found that placeholder resolution initially turned blank or
fragment-only targets into an API-root request, unlike the legacy no-path/null
result. Disposition: accepted and fixed before completion by rejecting those
references first. Regression cases now cover the no-path behavior.

`app/src/lib/git/for-each-ref.ts` uses `%(worktreepath)` alongside the current-HEAD
guard to exclude occupied branches during candidate discovery.
`app/src/lib/git/fetch.ts` independently obtains a fresh `listWorktrees` inventory
at the mutation boundary, reserving every branch-bearing entry regardless of
locked/prunable metadata. Detached entries do not reserve a branch. A failed
inventory throws before fetch. Sandbox rules are re-read before each attempt.

The local fetch retains fast-forward safety and FETCH_HEAD preservation. Exit
128 is inspected only for the exact single-line Git checked-out-branch refusal
for a ref actually submitted in this attempt. The refused ref is dropped,
inventory/sandbox state refreshed and remaining candidates retried. Every retry
removes at least one candidate, bounding the attempts by original candidate
count. Other exit-128 diagnostics throw a GitError rather than being swallowed.
No all-or-nothing rollback of a failed batch is assumed.

## Static evidence and independent handoff

The three production file hashes are recorded in
[source manifest](pagination-worktree-20261111-source.json); saved source diff
is retained locally in ignored `out/pagination-worktree-source.patch`.

- Complete app TypeScript `--noEmit --skipLibCheck`: PASS.
- Scoped Prettier and whitespace: PASS.
- Scoped ESLint: PASS with baseline installed-rule and API line225 ban-types
  exceptions. The unrelated existing declaration was preserved.
- No new automated tests run by developer. Independent `notification_review`
  authored and ran sixteen pagination contracts and nine real disposable-Git
  contracts: all 25 PASS. Pagination tests extract the exact production functions
  and reject any legacy URL.parse invocation. Git tests load the exact production
  modules through a core Git adapter backed by real Git in a single disposable
  fixture, covering discovery/mutation occupancy, sandbox rules, fail-closed
  inventory, actual checkout race/remaining eligible updates and genuine,
  unsubmitted and mixed exit128 failures. No user repository was mutated.
- Restricted-token Git/MSYS execution initially failed with environment error
  0xC0000022. One normal-access run of the same disposable-only fixture passed;
  this was not a product defect. Its environment-failure log is retained.
- Affected pagination retest16/16 passed after the no-path fix; Git9/9 evidence
  reused because both Git source hashes remained identical. Final source hashes
  match independent review, no remaining actionable findings. Disposable fixture
  directories retired; no app/package/UI testing performed.
- Independent combined app TypeScript also PASS exit0. Final three source hashes
  verified after checks. [Independent acceptance](evidence/runtime-findings-20261111/independent-acceptance.json)
  records coverage, harness hashes, findings dispositions and limits;
  `independent-tsc-result.json` retains the static result. No validator operation
  remains active.

## Dispositions and remaining acceptance

- R3/P3 pagination: accepted and source implemented; independent acceptance
  complete. Other legacy parser calls are outside this focused flow.
- R5/P2 fast-forward: accepted and source implemented; independent acceptance
  complete. Git remains the final checkout-race guard.
- Exact code state is uncommitted; user's current package still contains the
  previous snapshot. User build/run acceptance follows source validation and is
  not inferred from compilation. [Current build/run instructions](../notification-build-and-trace.md)
  use the fresh output `dist/runtime-fixes-20261111` to preserve that running
  package. A local commit of these source/documentation/test changes was subsequently requested.

Cooperative status was read successfully with normal submodule access; common
sync lock absent before edits. No upstream integration, remote access, package
build, app launch or user repository mutation performed.
