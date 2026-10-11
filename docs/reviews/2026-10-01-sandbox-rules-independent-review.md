# Independent review of sandbox rules, aliases, and WSL launcher

Historical review. The five confirmed correctness findings were repaired on
2026-10-11; see [current remediation and validation](2026-10-11-sandbox-rules-remediation.md).
The reproduction below describes the implementation before those repairs.

Date: 2026-10-01. Reviewed by Codex at the user's request, treating the existing review as another opinion rather than an implementation directive.

Scope: the uncommitted implementation in `D:\code\git-desktop`, branch `desktop-improvements`, HEAD `2e5c746142e887ea6615b073367d0c502f14bbee`. The starting tree already contained 19 modified application files, new implementation/tests, and documentation. No application fixes, branch reconciliation, commits, or remote operations were performed for this review. The original review is preserved in `2026-10-01-sandbox-rules.md`.

## Confirmed findings

### R1 — P1: Failed source fetch can still advance a sandbox from stale refs (additional)

Evidence: `app/src/lib/stores/git-store.ts:930`, `:1099`; `app/src/lib/stores/app-store.ts:6090`, `:6129`; `app/src/lib/git/sandbox-rule.ts:171`, `:358`.

`performFailableOperation` emits errors and returns undefined. `fetchRemote` consumes that result but returns no success indicator; `fetchRemotes` therefore resolves after a handled fetch failure. `performFetch` proceeds to `updateSandboxRules`. Its `fetchedRules` argument proves only that rule configuration has not changed; it does not establish which sources were fetched successfully. Branch target resolution reads the existing `refs/remotes/<remote>/<branch>` without a fresh remote check.

Reproduced using real disposable repositories: clone A; fetch B without advancing the protected checkout; create C at the source; temporarily make the source path unavailable; call the real `GitStore.fetchRemotes`; observe one emitted fetch error and a resolved promise; pass the rule snapshot to `updateSandboxRules`; observe `updated` and checkout B. This is a stale-source advancement, even though the current source was unavailable and its actual tip was C. No external network or user repository was used.

Required behavior: propagate per-remote success/fresh target evidence to rule execution. Block rules whose branch source was not successfully fetched during this operation, while allowing rules with independently successful sources. A configuration snapshot is insufficient.

### R2 — P2: Target matching both blocks ordinary files and misses push refspecs (S4 confirmed and extended)

Evidence: `app/src/lib/sandbox-rule.ts:254`; `app/src/lib/git/push.ts:130` (refspec construction near the end of `push`).

From an ordinary branch with a rule for `refs/heads/protected`, the guard rejects `add -- protected`, interpreting the filename as a branch. The same guard accepts `push -- origin protected:protected`: neither the short nor full branch name equals the complete refspec argument. The app's push helper uses exactly this source:destination form when a remote branch is supplied. Current-branch protection still blocks normal pushes while the protected branch itself is checked out; the gap concerns explicit protected targets from another checkout/branch or internal callers.

Both guard outcomes were reproduced. No push was executed. Parse command-specific argument roles, including push refspec source/destination and force/deletion forms. Merely ignoring everything after `--`, as proposed in S4, would break detection because the push helper places its remote and refspec after `--`.

### R3 — P2: Invalid configuration has no working in-app repair path (S3 confirmed, remedy revised)

Evidence: `app/src/lib/sandbox-rule.ts:98`, `:222`; `app/src/lib/git/sandbox-rule.ts:49`; `app/src/lib/stores/app-store.ts:4417`; `app/src/ui/worktrees/sandbox-rule-dialog.tsx:68`, `:234`.

Malformed or unsupported configuration blocks mutation guards and fetch/pull. Worktree refresh catches the error before publishing its newly listed worktrees, leaving the prior list or initial empty state. Opening settings also fails its combined initial load before setting `branch`, so Save remains disabled; saving/removing a rule would in any event reread the same invalid configuration. The instruction to open settings to repair is therefore ineffective.

Keep conservative mutation protection when the protected set cannot be determined, but preserve worktree visibility and provide explicit inspect/reset/repair recovery with clear consequences. Do not infer that a branch is safe merely because its name is absent from malformed raw JSON. This finding is established by source tracing; a rendered malformed-config recovery test was not run.

### R4 — P2: Async commit protection check can attach a keyboard listener after unmount (additional)

Evidence: `app/src/ui/changes/commit-message.tsx:350–363`.

Mount now awaits `refreshSandboxProtection()` before installing the window keydown listener. If the component unmounts while Git is resolving protection, unmount removes a listener that has not yet been added. The pending mount continuation then installs it despite `sandboxMounted` being false. The flag guards setState inside the refresh helper, but not the subsequent listener registration. Switching views during that asynchronous interval leaves the old component subscribed to keyboard events. Register synchronously before the await or check mounted state immediately after it. Source-confirmed lifecycle ordering; no browser timing reproduction was run.

### R5 — P2: A failed submodule completion cannot be retried by ordinary Fetch (additional)

Evidence: `app/src/lib/git/sandbox-rule.ts:220–300`.

After the superproject advances, submodule update can fail, and the service correctly reports partial completion. On the next click, `submodule update` is only reached inside `owner.head !== target.sha`; the superproject is already at that SHA. An old submodule checkout can instead make the cleanliness check block immediately; an uninitialized submodule may leave status clean and yield `current` without initialization. The documented partial-failure reporting is accurate, but normal Fetch offers no completion retry for this state.

Provide an explicit safe completion/retry path, preserving actual submodule edits, and test a submodule fetch failure followed by source recovery. This is a source-based recovery finding; submodule failure injection was not run.

## Assessment of every original review item

| Item | Independent conclusion |
| --- | --- |
| S1: hard-coded Debian-WSL1 | Not a must-fix for this custom build. It matches the user's explicit PC policy and the helper's stated purpose. Defaulting to another distribution or automatically opening Ubuntu would violate that policy. Portability would justify a configurable setting if distribution of this custom behavior is requested. Launcher tests mock spawn; actual WSL launch was not verified. |
| S2: initially disabled commit box | Confirmed transient misleading message. The initial state is true in every repository until async resolution. Keep a disabled pending state, but distinguish pending, protected, and configuration-error messages. P3 presentation issue, rather than evidence that ordinary commits remain broken. R4 is a separate lifecycle defect in this area. |
| S3: invalid rules | Confirmed with the additional repair dead end in R3. Reject the proposed raw-text-based fail-open heuristic. |
| S4: broad argument matching | Confirmed and extended in R2. Command-aware parsing is necessary; a universal `--` cutoff is not sufficient. |
| S5: skips fetch behavior | The call-path difference exists, but the claimed loss of all-remotes discovery and final refresh is not established. The new path obtains all configured remotes when no explicit list is supplied, and low-level foreground fetch retains wide ref discovery. `performFetch` ends in `_refreshRepository`, whose `_loadStatus`, `loadRemotes`, and `loadBranches` restore status/ahead-behind and branch state (`app-store.ts:4117–4133`; `git-store.ts:1152–1160`). Consolidation could simplify maintenance; R1 is the concrete fetch correctness defect. |
| S6: two extra processes everywhere | Overstated. With no rules, the guard reads config and returns before symbolic-ref: one extra process for commands entering this path. With rules, it normally adds two. This is a plausible performance cost, not a measured regression. Caching must account for external config/HEAD changes and linked worktrees; the app event alone is not a complete invalidation strategy. |
| S7: Pull becomes Fetch | The routing is intentional and documented, preventing an ordinary pull from overshooting the selected release. Settings say Fetch/Pull advances the rule, the toolbar changes, and non-current results produce a banner. A menu-label explanation is a usability improvement, not a reason to restore ordinary pull. |
| S8: unauthenticated release API | Public unauthenticated access is not inherently a defect. Rate-limit/unavailable metadata blocks the affected rule through per-rule error handling; it does not necessarily fail every rule. Better sign-in/rate-limit guidance is useful. Reject automatic fallback to tags: that changes published-release provenance, which the plan explicitly distinguishes from Git-only tags. No live API test was performed. |
| S9: String(error) | Confirmed cosmetic inconsistency, P3. The partial-success message correctly states that the sandbox already exists. Other new dialog handlers also use String(error); a shared readable formatter could improve consistency without merging another branch. |
| S10: integrate test branch | Verified divergence, not a demonstrated code defect or authorization to merge. Current `test` is `29df7ba858`, not the review's older snapshot. HEAD already includes `2e5c746142` ("Correct verified desktop improvements review findings"), and current GitStore has the foreground all-remotes behavior. `44fa10477d` is not an ancestor of HEAD, but commit ancestry alone does not establish missing equivalent fixes. Resolve actual overlap when integration is requested; do not require a merge/rebase before review work. |

## Positive evidence and boundaries

The existing real-Git tests verify exact owning-worktree advancement, commit blocking, rule disable, linked-worktree sharing, dirty/divergent refusal, ignored-file collision preservation, locked-worktree partial results, source URL drift, private tag refs with a conflicting local tag, deleted recorded tags, and unavailable release metadata. Release API tests verify complete pagination and rejection of later-page failures. Alias tests verify independent persisted names and Windows path normalization. The new findings concern scenarios those tests do not cover.

The common-directory queue serializes rule saves/updates and queued source checks. It is not a universal lock around all app operations, and the outer fetch happens before entering the update queue. HEAD/branch rechecks and Git safety checks are valuable, but neither the queue nor these tests establish cross-process race exclusion.

## Validation performed in this review

1. `node script/test.mjs app/test/unit/sandbox-rule-test.ts app/test/unit/git/sandbox-rule-test.ts app/test/unit/sandbox-release-api-test.ts app/test/unit/ui/sandbox-rule-dialog-test.tsx app/test/unit/worktree-alias-test.ts app/test/unit/wsl-launch-test.ts` — **28 passed, 0 failed**. React printed its existing awaitable-act warning. The initial sandboxed runner failed with spawn EPERM; the approved outside-sandbox run completed using Node 22.23.1.
2. `node script/test.mjs docs/reviews/2026-10-01-sandbox-rules-repro.ts` — **2 passed**, confirming the observed defects in R1/R2. These are deliberately evidence assertions of current faulty behavior, not regression tests defining desired behavior. They use temporary local repositories; the push check invokes only the guard. An initial import-resolution error was corrected before the successful run.

The reproduction source is retained beside this document so the evidence can be rerun. No full suite, TypeScript build, package/install, native UI session, live provider authentication, or actual WSL launch was performed. The plan's earlier 46-test claim is prior implementation evidence, not this review's test count. R3–R5 are identified as source-based findings rather than falsely attributed to the passing reproductions.

Recommended priority: fix source-fetch freshness first; then command-target parsing and invalid-config recovery; cover mount/unmount and submodule completion retry; finally polish pending/error text. This document records recommendations and evidence, not authorization or a claim that fixes were applied.
