# Gitx integration analysis and UI proposal

Date: 2026-11-06. Owner: Codex. Status: analysis complete; cross-repository implementation explicitly deferred by user. Future entry point: Folder Group level.
Source: Git Desktop desktop-improvements at fb2943f4e35bb6328bcc14e6f8a24ab6b6043399 and current D:/scripts/cmd/gitx*.ps1, git-audit-all.ps1, git-refresh-all.ps1, git-output.ps1. Static inspection only; no script execution, fetch, pull or remote access.

## Recommendation

User decision (2026-11-06): defer cross-repository capabilities. Preserve this design as a future Folder Group feature. Offer Check locally, Fetch and check, and Update eligible… from the Folder Group header/context menu, with results scoped to that group. This supersedes the original application-level overview and arbitrary scope-selector proposal. Keep Changes / History / Files scoped to the selected checkout. Group results can expand into worktrees and branches, default to Needs attention, and open existing Desktop workflows. Confirm the existing Folder Group membership/discovery semantics before implementation; do not assume a group includes every nested repository on disk. This deferral does not authorize a separate single-repository implementation.

## Capability mapping

| Script capability | Desktop presentation |
| --- | --- |
| Default local audit | Check locally; remote data age visible |
| Fetch all remotes and prune, then audit | Fetch and check; progress per repository |
| Refresh with fast-forward-only pulls | Update eligible… opens a concrete checkout preview |
| Folder discovery | Use the selected Folder Group membership and its established folder discovery rules |
| Shared common Git directory | One repository group, expandable worktrees; fetch once per group |
| Every local branch, including inactive branches | Branches detail tab with upstream, ahead, behind, commits absent from fetched remote refs |
| Dirty worktrees, including untracked/submodule changes | Uncommitted changes badge, checkout path and Open changes |
| Missing/prunable registrations | Worktrees detail tab; existing repair workflow |
| No remotes / no upstream / missing upstream | Distinct labels and contextual actions |
| Verbose output and remote URLs | All results toggle, Remotes and Diagnostics details |
| Jobs 1–32, default 4 | Advanced concurrency setting; serialize within each repository |

## Wireframe (illustrative data, not an audit of these repositories)

```text
Folder Group overview                     [Check locally] [Fetch and check]
Folder Group: Code                                        [Update eligible…]
Remote information: cached • last fetched 25 minutes ago

[Needs attention 8] [All 24]    Search repositories, branches, paths…
--------------------------------------------------------------------------
Repository / checkout          Findings                     Last checked
> git-desktop                  Uncommitted changes          Just now
> Example API                  Behind 3 • 2 worktrees       Just now
> Example web                  Diverged +2 / -4             Just now
> Example tools                No upstream                  Just now
--------------------------------------------------------------------------
Example API       D:\code\example-api          [Open in Desktop]
[Worktrees] [Branches] [Remotes] [Diagnostics]
main        main             Clean • behind 3     [Open] [Select to update]
feature     feature/search   4 changed paths       [Open changes]
external    experiment       Outside scope        [Open]
```

Use existing Desktop spacing, type, theme variables, resizable panes and virtualized lists. Preserve worktree aliases and pins. Icons must have text labels; keyboard selection, filter focus, loading announcements and focus restoration are required. Counts represent distinct repositories or checkouts with explicit labels; never sum overlapping per-branch commit counts as unique commits.

## Update interaction

1. Fetch selected repository groups, then calculate eligible in-scope checkouts.
2. Preview branch, path, upstream, incoming commit count and skip reason for every selected checkout. Primary action: Update N checkouts. Clean and behind-only checkouts qualify; already-current checkouts need no write.
3. Recheck status, branch/upstream, operation markers and expected commits immediately before execution. Git execution layer owns eligibility and rejects stale plans. Serialize work within a shared common directory and coordinate with Desktop operations/background fetch.
4. Advance only by fast-forward. Retain the script restrictions against automatic stash, branch switch, reset, commit or push. Detached, dirty, diverged, missing-upstream and in-progress checkouts receive explicit skip reasons.
5. Show Updated / Already current / Skipped / Failed individually, then refresh observations. Stop cancels queued work; report any in-flight operation according to its actual final state. Failed repositories do not hide successful results.

Outside-scope sibling worktrees are visible for context but excluded from bulk updates. Scan discovery does not automatically add all repositories to Desktop. Opening a discovered repository can use the existing add/open flow.

## Source findings and dispositions

These are integration findings, not changes authorized against the scripts.

- F1 — Accepted for implementation design: audit and refresh use different discovery algorithms. Audit stops crawling at a checkout, excludes many generated directories, expands registered sibling worktrees and initialized submodules. Refresh continues inside checkouts, excludes only four names, skips linked directories and recognizes bare repositories. Introduce one discovery inventory with explicit relationship and scope fields; deliberately define nested repository, submodule, bare and junction handling. A mode switch must not silently change inventory.
- F2 — Accepted for implementation design: audit calls configured remotes with no cached branch refs an unpublished repository even in local-only mode. Empty cache is insufficient evidence of remote publication. Use No fetched branches / Fetch to verify; keep no-remotes distinct.
- F3 — Accepted for implementation design: audit reports commits unreachable from any remote ref; refresh reports ahead-of-upstream for tracking branches. Both are useful but different. Preserve separate fields and avoid equating ahead with never published.
- F4 — Accepted for implementation design: refresh calls pull (which fetches again) after the group fetch; divergence is handled by failed ff-only pull rather than an explicit preflight skip. For Desktop, prepare a fresh plan and use a guarded fast-forward to the verified fetched upstream with final revalidation. Show divergence before action. This is a semantic refinement, not literal CLI parity.
- F5 — Accepted for implementation design: refresh branch attention is assembled before pulls and is not a complete post-update audit. Recompute after updates; distinguish a successful pull that changed nothing from an actual advancement.
- F6 — Accepted for implementation design: some audit probes suppress errors or fall back (worktree listing, submodule expansion, remote-ref enumeration); upstream comparison failure is labeled missing upstream. Use typed Unknown/Failed states with evidence, not clean/missing conclusions from arbitrary command failures. Incomplete scan must remain visible alongside usable results.
- F7 — Informational: CLI output is human-oriented text; normal audit summaries themselves are parsed from finding strings. Do not parse those strings as the app contract. Port semantics into typed TypeScript Git services.

## Integration approach

Correction from follow-up source inspection (2026-11-06): this checkout already includes app/src/ui/repositories-list/repository-health-dialog.tsx and app/src/lib/repository-health.ts. The dialog has added-repository/folder scopes, local inspection, fetch/update actions and result reporting. The original assessment missed these integration surfaces. Reuse and assess these services before proposing a new service; the design is an evolution of existing functionality, not a claim that no health feature exists. Existing broad health functionality is not removed by the user's deferral of new cross-repository work.

Also reuse app/src/lib/git/worktree.ts for worktree enumeration (already NUL-delimited), app/src/models/worktree.ts and alias/pin helpers, app/src/ui/worktrees for checkout navigation/repair, and app/src/lib/stores/app-store.ts for state refresh/navigation. Keep operation orchestration outside React presentation. Use Desktop’s Git execution and authentication infrastructure; the CMD file is only a PowerShell launcher and is unsuitable as a packaged runtime dependency.

Suggested result objects: repository identity/common directory, discovered paths and scope, worktree observations, branch observations, per-remote freshness/failure, scan errors and operation results. Distinguish observed data from proposed update plans. Never expose credentials embedded in remote URLs in copied diagnostics.

## Finite proposed implementation backlog

All items below are deliberately deferred for the future Folder Group feature. Findings F1–F6 remain accepted design considerations with execution deferred; F7 remains informational. Resume only on a new implementation request, starting with existing Folder Group membership/discovery behavior.

1. P1 inventory and local overview (F1–F3, F6–F7): selected Folder Group scope, common-directory deduplication, worktree/branch details, cached-data labels, incomplete-scan handling. Accept against synthetic nested repositories, external siblings, submodules, junctions, missing paths, unborn/detached branches and overlapping commit ancestry.
2. P1 fetch orchestration: bounded concurrency, authentication, per-common-directory coordination, partial failures and cancellation. Verify one fetch per group and no worktree writes.
3. P1 update preview/execution (F4–F5): guarded fast-forward only, state-change revalidation, consistent post-run audit. Verify dirty/untracked/submodule states, divergence, active operations, out-of-scope paths and concurrent edits all block inappropriate updates.
4. P2 packaged UI acceptance: keyboard/screen-reader flows, theme/resize, large inventories, open-existing/discovered checkout navigation and credential prompts. Local source checks do not establish packaged acceptance.

## Verification limits

Inspected source without executing the gitx scripts. Git status needed --ignore-submodules because existing submodule metadata access failed. Existing modified TODO.md and untracked Codex-ToDo.md were preserved. Prior project ledger still records packaged visual/authenticated-push acceptance and empty-directory cleanup as unresolved historical tasks; this proposal does not take them over.

## Selected-repository UI proposal — 2026-11-06

Follow-up request: suggest a UI after deferring cross-repository work. This proposal covers only the selected repository, all its local branches and its registered worktrees, including siblings outside its directory. No folder crawling or other repositories are included. Submodule changes can affect checkout cleanliness; independently inspecting/updating submodule repositories is outside this design. This is design work, not authorization to implement.

### Placement and layout

- Repository menu > Status… opens a wide, resizable Repository status dialog, approximately 900px at normal desktop widths, constrained to the available window. Reuse the existing health naming/infrastructure internally; Status is the proposed user-facing label.
- Leave the existing Changes / History / Files tab strip and current checkout toolbar layout intact. A status entry in the repository context menu can provide the same shortcut. A permanent fourth tab is unnecessary for this occasional whole-repository view.
- Header: repository name/path, Check locally and Fetch all remotes. Show separate local-check and remote-data freshness, with per-remote errors in details. Opening checks locally and does not imply a network operation. Fetch includes pruning remote-tracking refs and preserves the working files.
- Worktrees / Branches / Remotes section buttons below the header. Each section has a compact selectable list and an adjacent detail pane; selection never changes the active checkout. At smaller widths stack details below the list. In the desktop implementation, constrain the dialog to the window and scroll the list/details as necessary.
- Footer: explicit selected-repository scope and Review updates…. Count worktrees and branches separately. Show all items by default for a single repository; introduce a filter only if real inventories justify it.

### Content and actions

- Worktrees: existing alias/pin, Current marker, branch, clean/changed paths, ahead/behind or operation state. Details expose full path, upstream and changes. Open changes explicitly navigates to that worktree using the existing guarded switch flow. Missing/prunable entries offer the existing repair/review flow, never deletion on selection.
- Branches: every local branch, including those not checked out. Details separate ahead/behind of upstream from commits absent from all fetched remote branches. No upstream and missing upstream are distinct states. Not checked out does not imply inactive or disposable. Existing History/Push workflows handle explicit follow-up; this view does not bulk push or switch branches automatically.
- Remotes: name, fetch URL, last successful fetch, per-remote failures and data freshness. Conceal credentials in URLs/diagnostics. No fetched refs is Unknown/Fetch to verify, not proof of an unpublished repository.
- Healthy state: show Up to date/Clean without inventing tasks. Error state: show the failed observation and Retry; incomplete observations never become green results. Detached/unborn branches, missing paths, active operations and no remotes each receive explicit text.

### Update flow

Review updates fetches and checks this repository, then presents a fresh plan containing eligible checkouts and explicit skip reasons. Checkboxes select eligible worktrees when more than one qualifies; no automatic selection of unchecked-out branches. The final action reads Update N worktrees, or Update Main when exactly one named checkout is selected. Display expected incoming commits, upstream and paths. Fetch failure leaves affected comparisons stale and prevents updates relying on them.

Immediately before execution, the Git service revalidates branch, upstream, cleanliness, operation state and expected commits. Changed plans require renewed review. Fast-forward only; no automatic stash, branch switches, merge commits, reset or push. Serialize operations within the common Git directory and coordinate with existing foreground/background operations. Report updated/already-current/skipped/failed separately and recheck afterward. Closing or stopping must not imply undo of an operation already completed.

### Design evidence and disposition

- Interactive sample: C:/Users/vinni/.codex/visualizations/2026/11/06/01a1aefb-215a-7f60-9429-2d4224d81069/repository-status.html. All displayed repository state and update results are illustrative; the mock performs no Git or network operations.
- Local DOM verification passed for section selection, worktree/branch detail, no-upstream explanation, remote freshness, changed paths, update preview, simulated result and return-to-status. Initial verification selector syntax was corrected; it was a harness issue, not an app defect.
- No packaged application or visual rendering acceptance was performed. This mock is a design discussion aid; production integration, runtime safety and accessibility validation remain unimplemented.
- Accepted design correction: reuse the existing health feature as the starting point. No production defect asserted from this limited UI inspection. Further design/implementation awaits user direction; Folder Group expansion stays deliberately deferred.


## Existing-dialog refinement supersedes new-dialog recommendation

Follow-up assessment: [Existing Repository health fit](../reviews/2026-11-06-gitx-health-fit.md). Prefer adapting its existing expandable layout with Current repository scope, remote details/freshness and worktree update preview. Core gitx audit/fetch/update capabilities already exist. The tabbed Status mockup remains an optional design alternative. No implementation authorized by this analysis request; new Folder Group work remains deferred.
