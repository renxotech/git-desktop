# Fast-forward rules for local sandboxes

Status: implemented in source and verified with focused tests on 2026-10-01. No user branch updates or packaged-app installation.

## Product contract

A local sandbox can have a configurable fast-forward rule. The user configures it once, then uses the existing Fetch/Pull button. Git Desktop performs its improved fetch, resolves the rule, and advances the sandbox branch when possible. No separate update command or confirmation dialog is required for normal eligible updates.

A sandbox means a local checkout/worktree with an attached branch. The rule is displayed and configured on the sandbox, while branch protection is shared across every worktree that uses that branch. Rules are local app configuration associated with the repository's canonical common Git directory, branch ref, and owning sandbox. They do not get committed or pushed. A rule cannot silently follow whichever branch happens to be checked out: switching branches requires stopping tracking or creating a separate working sandbox.

| Example sandbox / branch | Configured source | Result after Fetch/Pull |
| --- | --- | --- |
| development | Remote branch: upstream/development | Exact fetched upstream branch tip |
| beta | Latest published beta release from upstream | Exact beta release-tag commit |
| stable | Latest published stable release from upstream | Exact stable release-tag commit |

These three names are examples, not reserved names. Custom rules and branch names are supported. The current checkout and its history are outside this proposal's scope.

## Existing behavior and extension

The fork's user-initiated fetch in `app/src/lib/git/fetch.ts` explicitly fetches all remote branch heads, including branches absent from a narrow clone refspec. Preserve that behavior. `app/src/lib/stores/app-store.ts` already invokes ordinary branch fast-forwarding after fetch. Extend that operation pipeline with sandbox rules; do not replace improved fetch with a narrow fetch of only the configured branch.

The app can create branches from history commits, but has no persistent release-channel rule. Its ordinary fast-forward helper follows Git upstream refs and cannot select a changing beta/stable tag. `script/draft-release/tags.ts` supplies semantic-version precedent, but globally shared local tags are not sufficient for upstream release provenance.

## Configuration UI

Add **Fast-forward rule…** to each local sandbox's context menu and a **Fast-forward rule** section in its settings. Optionally expose the same settings from its branch context menu. Use existing sandbox terminology in the final UI.

```text
Fast-forward rule — beta

Enable rule                         [✓]
Source remote                       [upstream ▾]
Source repository                   desktop/desktop
Remote URL                          https://github.com/desktop/desktop.git
Follow                              [Latest published beta release ▾]
Target now                          release-3.6.7-beta2 · d6619e0

Update when I click Fetch/Pull       On
Protection                          Commits and history changes blocked

                                    Cancel      Save rule
```

Follow choices:

- Remote branch: select a fetched branch, such as upstream/development.
- Latest published beta release: strict beta release selector.
- Latest published stable release: strict stable release selector.
- Latest matching tag: advanced Git-only selector with explicit prefix/pattern and version parsing. Clearly label it as tags rather than published releases.

For GitHub Desktop, prefill `release-` and beta/stable conventions when the user chooses a release selector. Other repositories need explicit provider/pattern settings. Show the full remote URL and repository identity so `origin` and `upstream` cannot be confused. An unavailable target can be saved as pending, but cannot trigger an update until resolved. Reject conflicting rules for the same branch.

Save explains: “Fetch/Pull will fast-forward this sandbox to the selected source. Local commits are disabled while this rule is enabled.” Enabling a rule does not rewrite an existing branch. Validate its current relationship and show blocked status if it has local commits; the user can save the rule while blocked and resolve separately. Missing beta/stable sandboxes may be created through the normal Create Sandbox flow with a rule option, using a resolved source SHA and existing branch/worktree creation UI.

Show a text badge in the sandbox selector, for example `Follows upstream/development`, `Beta 3.6.7-beta2`, or `Stable 3.6.6`. Provide source details, last successful check/update, and **Edit rule…**, **Create working sandbox…**, and **Disable rule** actions. Disabling retains the branch and files.

## Regular Fetch/Pull behavior

1. A user click runs the existing improved fetch for the repository's relevant remotes. Ensure every remote referenced by an enabled rule is included, even if ordinary remote selection would omit it. Fetch once per common repository, not once per sandbox.
2. Resolve all enabled sandbox rules in that common repository. Release/tag rules add explicit source-specific tag discovery and any necessary release metadata reads; fetching branch heads alone does not guarantee discovery of all tags.
3. Apply eligible fast-forwards automatically in their owning sandboxes. The rule saved by the user is authorization for routine updates. Preserve normal behavior for branches without a rule, excluding ruled branches from generic fast-forward logic so they cannot overshoot their selected target.
4. If the current sandbox has a rule and the toolbar currently says Pull, route the click through the same fetch-and-rule pipeline. Do not then pull its ordinary Git upstream, merge, or rebase. Keep the normal Fetch/Pull appearance; add a source tooltip and compact status rather than a separate primary update button. No ordinary ahead/behind counts against origin for ruled branches.
5. Background/timed fetch refreshes availability only in the first version. Automatic movement happens on explicit Fetch/Pull clicks. Background code must also exclude ruled branches from ordinary automatic fast-forwarding.
6. Refresh all affected sandbox histories/status after updates. Show one compact result such as “Updated development and beta; stable is current.” Errors identify the affected sandbox and source. Already successful updates remain successful if another sandbox fails; do not claim an atomic update across worktrees.

| Status | Display / behavior |
| --- | --- |
| Current | Local SHA equals resolved target SHA |
| Updated | Show selected version or source commit |
| Local changes | Skip that sandbox; show changed files and Create working sandbox |
| Local commits / divergent history | Skip; offer comparison and Disable rule |
| Operation in progress / locked worktree | Skip; show the affected sandbox |
| Source unavailable | Keep existing branch; show failed check and last known target |
| Source changed | Block rewritten/deleted recorded tag or changed remote identity pending review |

A resolved target is a hard boundary, not merely a commit the local branch must contain. Ahead of target is blocked, not Current. No reset, force-update, stash, discard, branch switch, commit, or push is part of Fetch/Pull rule execution.

## Target selection and provenance

For published-release selectors, enumerate all required release API pages from the selected source repository. Exclude drafts. Beta accepts matching prerelease metadata and strict `release-X.Y.Z-betaN` tags. Stable accepts non-prerelease metadata and strict `release-X.Y.Z` tags. Ignore test tags and other prerelease types. Select highest semantic version within each channel, not newest commit date; beta stays on the latest beta even if stable is published afterward. No eligible release means unresolved; never substitute development or another channel. Git-only matching-tag mode is explicit and does not claim release publication.

Resolve tags from the chosen remote and fetch objects into a source-specific namespace such as `refs/desktop-tracking/<source-id>/tags/<tag>`. Peel annotated tags to commits. Do not trust same-named fork/local tags or overwrite global `refs/tags/*`. Record prior tag object/commit identities; moved/deleted tags and changed remote URLs require review. Treat an offline, rate-limited, unauthenticated, or incompletely paginated release lookup as unavailable, without advancing from a guessed result. Other rules with fresh valid sources may proceed.

Release metadata identifies published source provenance. This feature does not establish binary signatures or reproducible-build guarantees.

## Safe fast-forward execution

Capture target commit SHAs once per click and use those immutable SHAs throughout the operation. Validate branch refs and owning worktrees immediately before mutation. Serialize app operations by common repository and owning worktree. If a concurrent edit/ref change occurs, stop or re-resolve safely; never overwrite it.

- Equal local/target SHA: no-op.
- Local tip is an ancestor of target: fast-forward eligible.
- Target is an ancestor of local, histories diverge, or objects are missing: blocked.
- Selected newer release has divergent history after a hotfix: blocked; publication does not authorize a reset.

For a checked-out sandbox, operate in its actual worktree using fast-forward-only Git porcelain against the captured SHA. Require a clean tracked/untracked state, no in-progress merge/rebase/cherry-pick/bisect, and an accessible unlocked worktree. Never move its branch ref directly behind its files/index. Avoid failing on ordinary ignored build outputs, but let Git refuse any ignored-file collision rather than overwrite it; the implementation must explicitly use overwrite-protection options and test this case. Reload and verify exact target SHA afterward.

If supporting configured branches temporarily not checked out anywhere, use expected-old-SHA ref updates and recheck worktree ownership. Do not bypass checked-out-branch protections. Implementation must prove safe handling of concurrent external checkouts, or restrict first-version updates to the configured owning sandbox. Missing/moved sandbox paths require relinking; do not silently create another checkout.

Persist schema version, sandbox identity/path, branch ref, source remote identity/URL, repository/provider, selector/pattern, last selected tag/object/SHA, and last check/update outcome. Handle sandbox rename/move, branch rename/delete, rule disable, and remote changes explicitly. Use independent rule metadata instead of ordinary branch upstream tracking; hide normal Publish/Push for ruled branches.

## Commit and edit protection

Commit protection is mandatory while a rule is enabled. Disable commit/amend, merge, rebase, cherry-pick, revert, push/publish, and conflicting branch-switch operations in the UI, and enforce the same restriction in dispatcher/store mutation handlers. Preserve the feature's own fast-forward operation through a narrowly scoped execution path. Commands invoked outside the UI must not bypass app protection through internal handlers.

Changes view remains available but explains “This sandbox follows its source. Create a working sandbox to make changes.” Disable app-owned editing actions and offer Create working sandbox for development. Keep external editor/open-terminal availability explicit: the first version may allow read/inspect access with the protection message, but cannot promise external tools are read-only. Newly detected edits block fast-forward until the user resolves them; never discard edits automatically.

Git Desktop alone cannot reliably prevent writes or commits from arbitrary editors, terminals, or other programs. Do not advertise app restrictions as filesystem protection. Git hooks are bypassable and often shared across worktrees, so do not install them silently. OS read-only attributes/ACLs can interfere with fetch-driven checkout, submodules, build outputs, and editors; keep filesystem locking outside the first version. If strict edit prevention is later requested, design it as a separate opt-in mode with per-worktree scope, temporary authorized write access, crash recovery, and platform-specific validation.

## Later implementation sequence and acceptance

1. Add versioned rule persistence, sandbox/common-directory identity, and models for selector/target/status.
2. Add source resolution using existing Git/remote-auth and provider API layers, strict semantic versions, pagination, and isolated tag refs.
3. Integrate rule execution into regular user Fetch/Pull, preserving improved branch discovery and excluding ruled branches from generic/background advancement.
4. Add ancestry/worktree checks, race handling, exact-SHA read-back, partial results, and commit/history mutation guards.
5. Add sandbox settings/context UI, status badges, Changes-view explanation, and Create working sandbox escape route.
6. Validate with focused resolver, Git integration, handler, and UI tests; document protection limits and recovery.

Acceptance: one ordinary click discovers newly created remote branches and updates eligible ruled sandboxes; development/beta/stable land exactly on their selected sources; no routine approval dialog; current ruled sandbox Pull cannot overshoot; background fetch cannot move ruled branches; ordinary sandboxes retain normal behavior; beta2/beta10 sorting and stable ordering; draft/test exclusion; complete pagination; source-specific conflicting/annotated/moved/deleted tags; offline and partial failures; dirty/locked/missing worktrees; local commits/divergence; ignored-file collisions; external edits/checkouts/ref races; handler-level commit restrictions; branch/sandbox lifecycle; keyboard and screen-reader support; multi-worktree persistence; no implicit push or destructive recovery.

## Implementation preparation (documented before code)

The user authorized implementation, then requested documentation first. This section records the concrete implementation contract before any application changes. Existing alias-related edits in the working tree are concurrent work and must be preserved. The current checkout's branches are not to be reconciled or configured as part of implementing the feature.

### Integration map

| Area | Existing integration point | Planned change |
| --- | --- | --- |
| Sandbox menu | `app/src/ui/worktrees/worktree-list-item-context-menu.ts`, `app/src/ui/toolbar/worktree-dropdown.tsx` | Add rule settings action for attached worktrees, plus current rule/status text |
| Dialog routing | `app/src/models/popup.ts`, `app/src/ui/app.tsx` | Add a typed rule-settings popup and render the new dialog without replacing alias functionality |
| Worktree model | `app/src/models/worktree.ts` | Expose displayable rule/status information without making fetched Git worktree records the source of persisted rules |
| Fetch execution | `app/src/lib/stores/app-store.ts` `performFetch`, `fastForwardBranches`; `app/src/lib/stores/git-store.ts` `fetch`, `fetchRemotes` | Include configured source remotes, preserve wide branch discovery, exclude ruled branches from generic advancement, then resolve/apply explicit-click rules |
| Pull execution | `app/src/lib/stores/app-store.ts` `_pull` | Route ruled current sandbox through fetch/rules and return before ordinary pull behavior |
| Git operations | New sandbox-rule Git service beside `app/src/lib/git/fetch.ts` and `worktree.ts` | Resolve refs/tags, classify ancestry, check owning worktree, fast-forward using captured SHA, verify result |
| Release discovery | Existing API/auth patterns in `app/src/lib/api.ts` | Add paginated published-release lookup and source identity validation; no unauthenticated hard-coded service bypass |
| Protection | Dispatcher/store mutation entry points and relevant UI components | Central policy check reused by all branch/history/file mutation handlers and disabled controls |

### Persistence and service boundaries

Use a versioned repository-scoped configuration keyed by canonical common Git directory, with per-branch rules and an owning worktree identity/path. Do not copy the path-only alias storage pattern for rules: it cannot by itself enforce shared branch protection across linked worktrees. Validate stored data when loading; corrupt or unsupported configuration must not execute updates. Persist only after validation, and refresh other open worktree views after save/disable.

Separate four responsibilities: configuration storage; source resolution; eligibility/application; display state. A resolver returns immutable source identity, SHA, optional tag/version, and check timestamp. Application returns a result per sandbox (`current`, `updated`, `blocked`, `failed`) with a readable reason. Source failures must not be reported as Git fast-forward failures, and successful fetch must not imply successful sandbox update.

### Mutation protection coverage

Audit every entry point before implementation, including `_commitIncludedChanges`, `_checkoutBranch`, `_checkoutCommit`, `_push`, `_publishRepository`, `_undoCommit`, `_resetToCommit`, `_mergeBranch`, `_rebase`, `_revertCommit`, `_cherryPick`, `_reorderCommits`, squash/amend operations, discard/stash/pop operations, and branch rename/delete. Guard both the current worktree branch and any explicit target branch. Disable destructive app-owned file operations as well as editing controls while the rule is active. Creating a separate working branch/worktree is allowed, without changing the protected sandbox's checkout.

Do not block abort/recovery handlers blindly: a rule cannot be enabled during an in-progress history operation, and externally started operations should remain recoverable. Continue operations that would write protected history are blocked; abort actions can remain available with normal Git safety checks. No permanent global Git hook or filesystem ACL changes.

### Delivery stages

1. Implement persistence, strict selectors, source resolution, and focused unit tests.
2. Implement safe owning-worktree updates and Git integration tests in temporary repositories; establish concurrency and ignored-file collision behavior before enabling updates.
3. Wire user Fetch/Pull and background exclusions, with integration coverage for all relevant source remotes and partial results.
4. Wire sandbox settings, badges/status, and central mutation protection. Verify settings apply immediately across linked worktrees.
5. Run the project's TypeScript checks, focused tests, and lint/format checks for changed files. Expand validation only for failures or affected shared contracts. Record unrelated baseline failures separately.
6. Update this document with actual implemented behavior, evidence, and any remaining limitations. Do not label a local source/test result as a packaged or running-app result.

No branch setup, build installation, commit, push, or deployment is implied by these implementation stages. A packaged app build can be performed when needed for delivery, after checking running-app/build-output conflicts using the repository's established workflow.

### Required verification scenarios

Use real temporary Git repositories and linked worktrees for: remote branch discovery under narrow fetch configuration; exact beta/stable boundary; current ruled branch Pull; untouched ordinary sandboxes; background exclusion; dirty/untracked/ignored collision protection; local commits and unrelated history; locked/moved worktrees; per-row partial failure; source remote changes; tag name collisions and annotated tags; rewritten/deleted tags; externally moved refs; restart persistence. Unit-test version/channel selection, published-release pagination failures, malformed configuration, and handler-level protection. UI verification must include keyboard access, rule enable/disable, blocked-state explanation, and preservation of existing alias actions.

If concurrency safety cannot be established for a branch without its owning sandbox, keep it blocked rather than implementing an unsafe direct ref update. If a provider is unsupported, expose explicit Git-only matching tags with its provenance label; do not silently weaken the published-release selector.

## Evidence and limits

Source inspected: `app/src/lib/git/fetch.ts`, `app/src/lib/git/branch.ts`, `app/src/lib/stores/app-store.ts`, `app/src/ui/create-branch/create-branch-dialog.tsx`, `app/src/ui/branches/branch-list-item-context-menu.tsx`, `app/src/ui/history/compare.tsx`, `app/src/ui/history/commit-list.tsx`, and `script/draft-release/tags.ts`.

Official release process referenced in the preceding conversation: https://github.com/desktop/desktop/releases and https://github.com/desktop/desktop/blob/development/.github/workflows/draft-release.yml. This document replaces the earlier separate Update tracked branches / preview-before-each-update proposal. The preparation sections above record the design before implementation; delivery evidence follows.

## Implemented behavior and usage

Open **Fast-forward rule…** from an attached sandbox's context menu or the current branch's context menu. Rules are stored as versioned JSON in local Git configuration (`desktop.sandboxRules`), shared across linked worktrees. Each rule identifies its local branch, owning sandbox path, source remote name and URL, and selector. Saving a rule does not move the branch.

| Local sandbox branch | Follow | Source |
| --- | --- | --- |
| development | Remote branch | upstream, development |
| beta | Latest published beta release | upstream |
| stable | Latest published stable release | upstream |

Published release modes use github.com release metadata and strict `release-X.Y.Z[-betaN]` tags. They exclude drafts and other tag formats, order versions numerically, and fetch every release page before selecting. Other providers can use the explicitly labeled Git-only semantic-version tag-prefix selector; that mode does not establish publication or build provenance.

For a new beta/stable sandbox, select its source, click **Check source target**, then **Create new sandbox at source…**. Enter a fresh branch name such as beta or stable and the sandbox destination. Creation uses the captured commit and attaches the rule. This is needed when the current checkout is newer than a release: fast-forward cannot move it backward. **Create working sandbox…** creates an ordinary editable sandbox at the current commit without changing the protected sandbox. To return an existing sandbox to normal editing, select **No fast-forward rule** and save.

The regular user **Fetch/Pull** action fetches all configured rule remotes through the improved branch-discovering fetch, then processes every eligible rule. Pull on a protected sandbox routes to this pipeline. Background fetch and generic branch fast-forwarding exclude ruled branches. A successful row advances only by ancestry-checked `merge --ff-only --no-overwrite-ignore` to a captured SHA in its actual owning worktree; HEAD is verified afterward and submodules are updated. No implicit reset, stash, discard, force update, or push occurs.

Rules reject changed remote URLs, unavailable publication metadata, dirty or divergent branches, missing/locked worktrees, active Git operations, and rule/source changes during the app's fetch workflow. Source tags use isolated refs rather than overwriting local tags, with advertised-object verification and detection of deletion or changes to the previously selected tag. Repository operations are serialized by canonical common Git directory. External processes are outside that queue; HEAD and branch identity are rechecked immediately before applying.

The UI displays source information, disables commit/amend controls, and provides per-sandbox result details when an update or problem occurs. The shared Git execution layer blocks protected app-owned history/checkout/push mutations and explicit protected branch/worktree targets; direct discard, Git-ignore writes, and Copilot conflict-file writes also check protection. Recovery abort/quit operations remain available. Existing sandbox alias functionality is preserved.

## Delivery verification and remaining limits

The following records the initial implementation evidence. For the subsequent
review fixes and current validation, see
[2026-10-11 remediation](../reviews/2026-10-11-sandbox-rules-remediation.md).

- 46 tests pass across rule configuration/selection, release API pagination, real temporary Git repository integration, settings UI, existing commit-message UI, improved fetch, worktrees, and aliases. Coverage includes protected Pull routing, exact captured source creation, wide branch discovery under a narrow refspec, ignored-file collision preservation, dirty/divergent branches, shared linked-worktree rules, locked-sandbox partial results, remote URL drift, annotated source tags with conflicting local tags, deleted recorded tags, unavailable metadata, and enable/reload/disable settings behavior.
- ESLint passes for touched TypeScript/TSX files; Prettier formatting and `git diff --check` pass.
- `tsc --noEmit --skipLibCheck --pretty false` passes. Full dependency declaration checking encounters existing WeakMap declaration conflicts in the installed TypeScript/lodash type dependencies; this is not claimed as a clean full check.
- Automated UI verification uses the repository's React test environment. Native running-app visual, keyboard, and screen-reader verification and a packaged build/install were not performed. Release HTTP responses are mocked in tests; no live authenticated release-provider integration is claimed.
- App protection does not prevent external editor/terminal writes or enforce filesystem ACLs. Dirty work blocks advancement. External Git operations can race app checks; the implementation performs conservative checks and Git safety operations, but does not claim a cross-process lock.
- Successful branch advancement followed by a checkout/submodule failure is reported explicitly as partial completion; updates across sandboxes are not atomic. Disabling a rule retains the branch and files. Missing/moved owning paths require rule reconfiguration rather than silent reassignment.
- Existing user branches and sandbox rules were not configured or reconciled. No executable installation, commit, push, or deployment was performed.
