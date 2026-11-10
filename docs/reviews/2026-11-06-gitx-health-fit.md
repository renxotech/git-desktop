# Existing Repository health: gitx fit assessment

Date: 2026-11-06. Owner: Codex. Scope: source-based UI and behavior comparison; no running-app inspection, Git operations, tests or production changes. Preserve unrelated editor implementation/build work visible in the checkout. This assessment supersedes the earlier implication that a new status UI/service is necessary.

## Conclusion

Extend the existing Repository health dialog. Its expandable worktree and branch sections accommodate the main gitx workflows already. A new tabbed dialog is optional presentation work, not a prerequisite. Current-repository scope and clearer operation targeting are the highest-value additions. New cross-repository/Folder Group work remains deferred; existing broad functionality is not removed.

## Existing presentation

`app/src/ui/repositories-list/repository-health-dialog.tsx` renders a dialog with Added to Desktop / Folder and subfolders scope, Check repositories, Needs attention only, Select visible and Clear selection. Repository entries show path and a unique unpublished commit count, expandable worktrees with upstream, changed files and Open in Desktop, plus All local branches. The footer has Fetch selected, Safely update selected and Close, or Stop while busy. Operation results and errors appear above the entries. `app/styles/ui/_repository-health.scss` makes it 820px wide with viewport limits and scrollable content.

## Capability comparison

| gitx behavior | Existing health coverage | Disposition |
| --- | --- | --- |
| Local audit with cached refs | inspectHealthRepository; automatic local scan on opening | Already present |
| Dirty/staged/untracked/submodule changes | Per-worktree porcelain status, expandable changed paths | Already present |
| Registered sibling worktrees | listWorktrees, common-directory deduplication | Already present |
| Every local branch, upstream, ahead/behind | All local branches section | Already present |
| Commits absent from remote refs | Per-branch/worktree and deduplicated aggregate; aggregate also includes worktree HEADs | Already present, clarify cached-data labels |
| Missing/prunable worktrees | Inline error; Open disabled | Present; repair navigation is optional refinement |
| Fetch all remotes and prune | performHealthOperation calls shared fetch per remote; shared fetch includes --prune | Already present |
| Fast-forward eligible checkouts | Fetch first; reject errors, dirty/detached/diverged/ahead/no-upstream/locked/in-progress cases; ff-only merge to fetched SHA | Already present; target preview needed |
| Post-action report | UI rescans after completed operations, preserves operation results | Already present |
| Parallel repositories | Store queues workers with limit 4; worktrees within repository processed sequentially | Default equivalent; configurable 1–32 jobs deferred |
| Remote names/URLs | Names exist in data model but UI only uses empty-remotes condition; URLs discarded | Small data/presentation addition |
| Verbose/clean output | Disable Needs attention only; expand worktrees/branches | Largely covered; add optional diagnostics/copy if needed |
| Current-directory focus | UI offers added repositories or folder scan, no current-repository scope | Add Current repository as default from repository context |
| Scan semantics | Nested folder discovery with exclusions; scan skips initialized submodules; identity requires a working tree | Not exact parity: gitx audit includes initialized submodules; refresh recognizes bare repositories |

## Findings and next actions

1. H1 — Accepted/actionable design item, P1, owner future implementer: add Current repository scope bound to the selected repository common directory. Retain its registered siblings without recursive folder discovery. Entry can remain Repository health. Scope of existing added/folder modes is unchanged; new Folder Group entry deferred.
2. H2 — Accepted/actionable design item, P1: add update preview and explicit worktree selection. Current selection is repository-wide; performHealthOperation loops every registered worktree. Folder selection is therefore not an update boundary. Show all target paths and skip reasons before execution; future Folder Group targets need an explicit boundary. Preserve last-moment checks. This is a verified behavioral difference from gitx refresh, not a claim that current behavior contradicts an existing documented contract.
3. H3 — Accepted/actionable design item, P2: display remotes, sanitized URLs and per-remote freshness/failure. Existing generic cached-ref explanation does not establish when each remote last fetched. Do not label absent cached refs as remote absence.
4. H4 — Accepted/actionable design item, P2: clarify publication and unknown states. The literal no-remotes message currently asserts the repository is unpublished, which is stronger than local evidence. Use No configured remotes. Failed worktree observations currently store zero files/commits while showing an error; display Unknown in those summaries rather than zero. Distinguish ahead-of-upstream from absent-from-all-fetched-refs.
5. H5 — Deferred scope decision: exact bare repository, initialized submodule, discovery and configurable concurrency parity is unnecessary for the selected-repository UI. Shared fetch also uses on-demand submodule fetch, unlike gitx refresh's explicit recursion disable. Resolve these semantics explicitly before promising CLI parity or expanding Folder Group operations.
6. H6 — Informational: Stop aborts queued steps; in-flight Git work is allowed to finish, and the UI states this. The store coordinates with known Desktop commit/checkout/fetch state. These are existing safeguards, not newly proposed features or proof against all external races.

All accepted items above are analysis recommendations awaiting implementation authorization. They do not authorize source fixes. Existing unit/UI test files cover the health feature, but were not executed during this comparison. Runtime behavior, authentication and rendered appearance remain unverified in this task.

## Minimal UI revision

Keep current expandable layout and name. Add Current repository to scope and make it the contextual default; Check locally is the clearer label in that scope. Put a Remotes disclosure and local/remote timestamps below the repository heading. Include ahead/behind in each worktree summary, plus its existing alias/current marker where available. Preserve All local branches and changed-path disclosure. Change Safely update selected to Review updates… and insert a concrete worktree preview before the existing operation runner. Reuse Open in Desktop and existing repair/history workflows.

The earlier interactive tabbed mockup is an optional alternative, superseded as the recommended first implementation by this smaller adaptation.
