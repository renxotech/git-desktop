# User runtime trace findings — 2026-11-11

The user built and ran the tracefix package. No agent launched, stopped,
rebuilt or changed application source during this check. Source is the
notification-initialization worktree; notification/trace fixes are committed as
`c31e726db240980d93979de882223bf8db1c1b64`. This review records the read-only follow-up; subsequent implementation and local
commit authorization are covered by the pagination/worktree fixes review.

## Runtime acceptance and build provenance

The user clarified that an earlier command had not executed because Enter was
missing, then confirmed the app was running. The earlier absent logs/processes
do not establish any silent startup bug. No such defect is filed.

Live JSONL records show main/browser startup at 20:14:07.063Z, renderer startup
at 20:14:07.557Z and a renderer DEP0169 warning at 20:14:09.012Z. The corrected
trace helper runs in both processes; the read-only traceDeprecation startup
failure did not recur. The app log records UI launching at 20:14:08.303Z.

The portable build logs notifications unavailable because there is no registered
fork notification shortcut. This is the intended safe unavailable state. The
inspected current electron.log contains no COM apartment/AUMID/read-only trace
errors. Installed Windows toast delivery and Action Center activation remain
unverified; do not describe portable notification delivery as working.

Packaged source maps match the accepted current app sources, the compiled vendor
facade matches local fixed output and packaged native SHA256 matches the prepared
fixed addon. The actual bundles retain runtime trace environment gating. However,
the final build-info manifest is absent: the user build compiled main.js at
01:37:02 local, task commit occurred at 01:38:24 and packaging finished at
01:39:06. That intervening commit changes the finalizer's HEAD/fingerprint check.
Packaging succeeded before that bookkeeping guard failed. Relevant code-content
verification supports using this diagnostic package; no full release/build-state
receipt or need for a blind rebuild is inferred from the guard warning alone.

Raw JSONL/electron/app logs remain local; no account data, URL arguments or tokens
are copied into this review.

## R3 — Actual deprecated URL parser identified

Disposition: original trace request **complete**. Accepted/actionable P3 follow-up
for owned API pagination migration; source change outside this read-only check.

Source-mapping the actual warning gives:

1. `app/src/lib/api.ts:697`, `URL.parse(match[1])` in
   `getNextPagePathFromLink`.
2. `getNextPagePathWithIncreasingPageSize` at api.ts:751.
3. `API.fetchAll` at api.ts:1846, called by `fetchUpdatedPullRequests`:1307.
4. `app/src/lib/stores/pull-request-store.ts:120` and
   `pull-request-coordinator.ts:158` during background pull-request refresh.

Next authorized implementation, if requested: replace legacy parsing in the
pagination flow with WHATWG URL, preserving path/query and increasing-page-size
semantics, with focused backend contract coverage. No speculative global parser
replacement, warning suppression or production edit was performed. Owner
unassigned pending a scoped implementation request.

## R5 — Local fast-forward includes another worktree's branch

Disposition: independently assessed **accepted/actionable P2**, separate from
notification initialization and URL parsing. Implementation pending user scope.

The user console shows a local `git fetch . --show-forced-updates
--no-write-fetch-head --stdin` refusal for a branch checked out in another linked
worktree. Git's refusal protects that worktree; do not bypass it.

Independent source review finds `getBranchesDifferingFromUpstream` in
`app/src/lib/git/for-each-ref.ts:74-148` excludes only the current worktree's
`%(HEAD) == '*'` at line 105. `app/src/lib/git/fetch.ts:121-163` applies the sandbox
filter but does not exclude branches checked out in other worktrees before
batching the local fetch. The existing linked file-history-explorer worktree
accounts for the reported refusal.

`performPushBranch` in `app/src/lib/stores/app-store.ts` awaits successful
`pushRepo`, records push state and refreshes before invoking local fast-forward
around line 6396. The private fast-forward wrapper at lines 6812-6821 catches and
logs failures. Therefore this log alone does not prove a remote push failed.
Neither does a batch fetch error prove all other ref updates were rolled back.
No remote operation/result was checked by agents.

Recommended scoped fix: at the lowest-level `fastForwardBranches` boundary,
exclude all canonical branch refs from a fresh linked-worktree inventory; fail
closed if that inventory cannot be obtained. Preserve Git's guard against races
and handle any remaining refusal narrowly. Do not use `--update-head-ok`, force
refs or move another worktree to bypass safety. Owner unassigned; next action is
a separately authorized implementation/validation chunk. No fetch, push, branch,
ref, worktree or production changes were performed for this finding.

## Verification limits

Read-only packaged source/log inspection and independent source review, no new
tests or UI interaction. The user's app remains running and untouched. Current
notification source acceptance carries prior independent evidence; observed
startup and exact URL trace add user-runtime evidence only. The two actionable
follow-ups above remain visible in the ignored task ledger with scope limits.
