# Unmerged branch activity sorting: performance assessment

Date: 2026-11-10. Owner: Codex. Scope: evaluation and recommendation only; no implementation requested. Source inspected: app/src/lib/git/unmerged-branches.ts and app/src/ui/branches/unmerged-branches-dialog.tsx in D:/code/git-desktop. Preserve unrelated source changes.

## Current behavior

The data query resolves the target, lists unmerged local/remote refs, lists worktrees and runs one rev-list count per returned branch with concurrency six. No explicit activity sorting or timestamp fields exist. The dialog waits for all results; toggling remote inclusion only filters already-loaded rows. Changing target reloads queries. Existing ancestry/count work is a separate baseline cost from sorting.

## Cost and semantics

Let B be returned branches, W checked-out worktrees of those branches, and N the total tracked paths across those worktrees. Adding tip committer timestamps to the existing for-each-ref format avoids per-branch log processes; sorting is O(B log B). This is the low-cost part. Define last commit as branch-tip committer date, not author date or the numerically greatest timestamp anywhere in history. Commit timestamps are not guaranteed monotonic.

Literal newest tracked-file mtime requires obtaining a tracked inventory per applicable worktree and O(N) metadata observations, with bounded concurrency. Reuse inventory per worktree; never repeat scans per branch or scan the filesystem recursively. Large/generated tracked trees, cold caches, network drives, antivirus and WSL crossings can dominate. File contents need not be read or hashed. stat itself is not a historical edit log: checkout, restore and tools can change/preserve mtimes; unsaved edits do not count. Deleted tracked files have no current mtime. Remote refs and unchecked-out local branches have no working-file edits attributable to them. Never copy a local branch's edit time onto its similarly named remote ref. Submodule gitlinks are boundaries, not tracked regular files whose descendants should be traversed.

Read-only local sample (single run): git ls-files -z listed 2,717 index entries in 45ms; lstat on the first 1,000 entries at concurrency 16 took 43ms with zero failures. This is a warm, single-worktree sample, not full-tree/all-worktree/cold-cache evidence or a latency guarantee. Ref enumeration returned 432 local/remote refs; that is not the number of unmerged branches. No fetch, mutation or script gitx execution occurred.

## Recommended middle ground

Default sort: descending max(branch-tip committer date, newest available mtime among currently changed tracked files in its checked-out worktree). Break ties by branch name then full ref. Label the field Last activity and show its source (commit/local edit) plus a tooltip with exact date and approximate nature. This is explicitly narrower than literal newest mtime across every tracked file.

Use a worktree status query excluding untracked files to identify staged/unstaged tracked changes and safe NUL-delimited path parsing. Then inspect metadata only for those paths, using new paths for renames and not following symlink targets outside the checkout. Status itself can still scan a large tracked index; this reduces application-level file metadata work, not necessarily overall complexity to O(changed files). Include staged-only paths. Missing/deleted paths have unknown edit times: preserve an activity warning rather than assigning fabricated mtimes or using index mtime as edit evidence. Reverted edits cease to be visible; durable edit history is a different feature.

Populate commit-based results first, then enrich from local edits in the background while the dialog is open. Mark Checking local edits, cancel obsolete work, and apply a single final resort rather than moving rows repeatedly. Preserve focus/selection. Cache per worktree; invalidate on relevant HEAD/index/file events and explicit Refresh, with a short freshness limit checked on access as fallback. HEAD alone does not invalidate ongoing edits. Changing comparison target should reuse worktree observations while recomputing membership/counts.

An optional Latest tracked-file timestamp mode can perform the literal full inventory scan on demand, with progress and cancellation, if strict filesystem-mtime ordering is useful. It should clearly state that checkout/restore times can dominate. Never silently call changed-files-only ordering exact. Commit-only remains the immediate/fallback order; failures/incomplete timestamps must be visible.

## Findings and dispositions

- A1, accepted recommendation P1, owner future implementer: add branch-tip committer date to existing ref metadata and stable descending sort. Status: proposed, implementation awaits direction. Next: extend query/result model and focused ordering coverage.
- A2, accepted recommendation P1, owner future implementer: changed-tracked-file activity enrichment with clear semantics, per-worktree caching, bounded work and stable UI application. Status: proposed; user decision needed on narrower definition before implementing. Next: confirm default semantics, then cover staged/rename/deletion/symlink cases and stale-result cancellation.
- A3, optional/deferred: full tracked inventory timestamp mode and real large/cold multi-worktree benchmarks. Next only if strict mtime behavior or measured latency warrants it. No background service or polling requested.
- A4, informational: existing per-branch ancestry counts can dominate 432-ref repositories. Do not attribute all current dialog latency to the new sort or expand this task into count optimization without evidence.

Evaluation complete. No production changes, tests or runtime app acceptance. Sample timings are scoped above. Recommended decision: commit date plus changed tracked-file activity by default; literal all-file scan optional.

## Selected implementation and verification

User selected commit-date descending only. A1 implemented in the existing for-each-ref query using --sort=refname followed by --sort=-committerdate (last key primary). Existing Promise.all preserves query ordering. No timestamp model, extra Git query or file scan is needed. A2/A3 activity enrichment/full scans are superseded for this task.

Reviewed the final source: local and remote refs use the same sort; symbolic refs remain excluded; target-picker ordering is unchanged; counts and worktree mapping retain existing behavior. No actionable review findings. Added a real-Git regression with author dates opposing committer dates, mixed local/remote tips and tied dates. All 4 focused unmerged tests pass. Initial restricted test run failed to write temporary Git objects; the same suite passed with normal local access. Focused Prettier and whitespace checks pass. No app build/launch, commit or push performed; source remains uncommitted. Changes: app/src/lib/git/unmerged-branches.ts and app/test/unit/git/unmerged-branches-test.ts on desktop-improvements, base fb2943f4e35bb6328bcc14e6f8a24ab6b6043399.

Commit review: source/test diff remains identical to validated implementation and requested successful production build. No new actionable findings. User authorized local commit on 2026-11-10. Production compilation and offline packaging passed; user requested no further verification. Packaged runtime acceptance remains unverified. Commit scope includes source, regression, this report and ledger only; no push.
