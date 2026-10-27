# File history explorer specification and reuse assessment

Research date: 2026-10-19. Status: proposed specification, with the user requirements below fixed. Implementation is not started.

The proposed Files tab combines a tracked-file explorer, file revision list, and the existing diff viewer. The best reuse path is to adapt tree algorithms and tests from upstream-linked TypeScript implementations, keep the app's existing diff presentation, and add a small file-history and exact-snapshot comparison layer. A wholesale cherry-pick would bring unrelated Changes-tab behavior and would not implement the requested explorer.

## Agreed requirements

- Scope the explorer to the selected repository or worktree root. Navigation must never escape that root.
- Display tracked files only. Exclude untracked files, including ignored untracked files.
- Selecting a file displays its revision timestamps and abbreviated commit IDs.
- Provide compact rows and an Outlook-style preview mode showing the commit subject and opening message lines.
- Selecting one committed revision displays its change against its parent. Selecting two revisions displays the difference between those exact snapshots.
- Reuse the existing diff viewer.
- For a tracked file with uncommitted changes, pin a first row with revision ID `Current` and the file's last-modified timestamp. One Current row represents the working file; there are no separate index and working-copy revisions.
- Current alone compares with HEAD; Current plus a committed revision compares with that revision. A deleted current file has no filesystem timestamp, so display an unavailable timestamp rather than inventing one.

## Upstream evidence and dispositions

Issue and PR status was read from the public GitHub API, including closed and unmerged work. Local source baseline: `3939ad61e8281a9c2b46eb2df586454673c36e99`. Available upstream development: `bebc062caafcf818993b9f53397b976d33484231`. Candidate code was read, not built or runtime-tested.

| Source | Verified state | Learning and disposition |
| --- | --- | --- |
| [desktop/desktop #11990](https://github.com/desktop/desktop/issues/11990) | Open, `not-planned` | Requests file-filtered history and a file context-menu entry. Add a View File History shortcut from existing file lists to the Files tab. This is a discoverability improvement, not an implementation to import. |
| [desktop/desktop #3754](https://github.com/desktop/desktop/issues/3754) | Closed | Earlier single-file-history request. Keep the workflow local and usable without a GitHub remote; closing a request does not establish that the feature shipped. |
| [desktop/desktop #20624](https://github.com/desktop/desktop/issues/20624) | Open feature request; discussion links working prototypes | Identifies compaction, filter/collapse interaction, rename labels, and keyboard navigation as design decisions. Its scope is changed files, not all tracked files. Adopt the interaction lessons, replace its data source. |
| [takaebato changes-tree-view](https://github.com/takaebato/desktop/tree/dcb5ff2317df76905fccaa05e84847a78daa9d5f) | Contributor prototype; not established as merged upstream | Substantial tree implementation with unit and UI tests. Prefer its stable directory identity, collapse-state handling, sorting, selection-preservation tests, and keyboard behavior as reference/adaptation material. The author's upstream comment warns that the branch is behind development. |
| [DesktopPlus #283](https://github.com/desktop-plus/desktop-plus/pull/283) | Merged in that fork on 2026-10-07; 24 changed files | Smaller tree helper plus folder UI and tests, used in Changes and History. Good extraction candidate. The PR describes Changes testing; that statement and merged status do not prove this explorer's behavior or performance. |
| [desktop/desktop #14814](https://github.com/desktop/desktop/pull/14814) | Closed, unmerged; head `ee9e4833dfefe135109beefe937d3bb5c816d947` | Adds state groundwork for another history mode; PR explicitly says the view is not implemented. Useful state separation reference, not a finished UI. This is the locally available `add-new-history-state` branch. |
| [desktop/desktop #14702](https://github.com/desktop/desktop/pull/14702) | Merged | Existing multi-commit mode requires a contiguous range because it compares oldest-parent to newest. Our two-snapshot selection must allow any two rows and bypass that range restriction. |
| [desktop/desktop #14720](https://github.com/desktop/desktop/pull/14720) | Closed, unmerged | Explains how merged histories make chronological range selections misleading. Use explicit endpoints and parent-based single-commit diffs; do not infer ancestry from timestamps. |
| [desktop/desktop #16631](https://github.com/desktop/desktop/pull/16631) | Merged | Fixes differences caused by selecting commits upward versus downward. Our comparison direction must be deterministic and independent of click order, with an explicit Swap action. |
| [desktop/desktop #17535](https://github.com/desktop/desktop/pull/17535) | Merged | Removes information available only in a hover tooltip because keyboard users cannot access it. Preview/full-message controls must work by keyboard, not only hover. |
| [desktop/desktop #6535](https://github.com/desktop/desktop/issues/6535) | Open, `not-planned` | Historical binary-file actions can misleadingly open today's file. Label endpoints clearly; an eventual Open This Revision action must extract the selected blob, not open the working path. External opening is optional later scope. |
| [desktop/desktop #17686](https://github.com/desktop/desktop/pull/17686) | Closed, unmerged | Historical LFS image preview experiment. Do not promise LFS content previews simply because ordinary image diffs work; provide a clear unavailable-content fallback. |
| [desktop/desktop #17564](https://github.com/desktop/desktop/pull/17564) | Merged | DDS support extends existing image handling. Reuse the current image pipeline and its feature gates, rather than implement another renderer. |

The earlier upstream blame discussion links [Corvene's Rust implementation](https://github.com/wasi-master/corvene/commit/36e6894745d39d3cfc85f960742a13dac12f5081). Its cancellation and stale-result design are useful concepts, but Rust code is not a direct import into this TypeScript app and line attribution is outside this explorer's current scope.

## Refined user experience

### Explorer and selection

Use three resizable panes: tracked-file tree, revisions, diff. Keep a visible repository/worktree identity and repository-relative file path. Remember expanded folders, selected file, and pane widths per worktree, not merely per shared Git directory.

Build the directory tree from Git's tracked paths instead of recursively walking disk. Use the union of HEAD paths and index paths, reconciled with status: this preserves staged deletions and includes newly staged files, which Git now tracks. A newly staged file can have Current and no committed history. A truly untracked file stays excluded. Sparse-checkout files absent from disk are not automatically classified as deletions.

Show folders before files with deterministic sorting. For the initial version, use ordinary uncompressed folder rows; optional single-child compaction can follow once collapse identities remain stable across filtering. Filtering should search relative paths, temporarily reveal matching ancestors, and restore the user's original collapse state when cleared. Preserve a selected file when merely collapsing its parent. If filtering excludes the file, clear its revision/diff selection with an explicit filtered-out state rather than silently showing an unrelated file.

Use Up/Down to move between visible rows; Right expands or enters a folder; Left collapses or moves to its parent; Enter selects a file. Keep tree semantics and focus understandable to screen readers. Do not import folder-level stage, discard, or ignore commands into this history browser.

Treat symlinks as tracked entries, not navigable directories. Treat submodules as repository-boundary entries, not folders to recurse into. Any access to Current must enforce resolved-path containment, including intermediate Windows junctions. A tracked symlink's own content is its link target text, not the target file. Reject escaping paths without hiding their committed history.

### Revision list and dates

Show Current first when Git status indicates staged or unstaged changes. Then show commits affecting the selected file, reachable from the selected worktree HEAD. Preserve Git history ordering, with descendants before ancestors where applicable; display timestamps as metadata rather than re-sorting rows by timestamps.

Compact mode shows exact date/time and Git's abbreviated SHA. Preview mode adds author, subject, and the first two non-empty message lines. Interpret "commit notes" as the commit message, not the separate `git notes` feature. Full SHA and complete message are available through keyboard-accessible controls.

Proposed date policy: match the existing app's author-date convention for committed rows, show an explicit local timezone in details, and include committer date in full details when it differs. Current uses filesystem modified time as requested. A filesystem timestamp is a label, not a revision identity or cache-validity guarantee.

Follow detected renames, maintaining the path used by each revision. Git's `--follow` operates on a single file and is not a general lineage guarantee across nonlinear history; do not promise perfect tracking through copies, delete/recreate cycles, or ambiguous renames. Keep pagination anchored to the same resolved HEAD and rename lineage. The chosen Git history policy must be exercised with merge and rename fixtures before implementation is accepted. See [git log documentation](https://git-scm.com/docs/git-log).

### Exact comparison rules

| Selection | Required comparison |
| --- | --- |
| One committed revision C | C's first parent to C, for this file. Label the parent SHA; for a root commit, compare against absence. Never use the next visible history row as an implicit parent. |
| Two committed revisions A and B | A's file snapshot to B's file snapshot, using each revision's historical path. Allow nonadjacent rows. Default From to the earlier position in history and To to the later descendant position; for incomparable branches use deterministic list order. Show both labels and allow Swap. |
| Current alone | HEAD snapshot to the current on-disk file, including changes represented in the index insofar as they exist in the current file. |
| Committed C plus Current | C's snapshot to the current on-disk file. |

The list is newest-first: "earlier in history" above means the older/lower row. Comparison direction must not depend on click order or timestamp arithmetic. Limit selection to two endpoints; Ctrl-click adds/removes an endpoint, and Shift-click can set the anchor and clicked row as endpoints without selecting all intervening revisions. A third added endpoint replaces the second, retaining the anchor.

One Current row cannot simultaneously show two different index and working-tree contents. If an edit is staged and then undone on disk, retain Current because status is dirty, but its diff against HEAD can be empty. Explain: "Current file matches HEAD; staged changes differ." Do not silently substitute staged contents or describe Current as exactly what the next commit will contain. Likewise, a staged deletion followed by recreation at the same tracked path needs an explicit index-versus-disk status distinction.

Show additions/deletions when one endpoint lacks the file. Distinguish an absent file from an empty file. Mark unresolved conflicts on Current; show the on-disk conflict-marker content where readable rather than inventing a merged result. Mode-only changes and symlink changes need status information even if there are no text hunks.

The diff heading always states file path, From revision, and To revision. Keep the existing inline/side-by-side, whitespace, image, binary, large-file, and unavailable-content behavior. An unchanged comparison is a valid result with an explicit empty state.

## Concrete code reuse map

### Borrow selectively from upstream-linked tree work

DesktopPlus candidate revision: `1f7efa98e06fc4fd4b5fa2128775f483e3c759c9` (PR #283 head).

- [app/src/lib/file-tree.ts](https://github.com/desktop-plus/desktop-plus/blob/1f7efa98e06fc4fd4b5fa2128775f483e3c759c9/app/src/lib/file-tree.ts): generic `buildFileTreeRows`, `getNestedFolderPaths`, and rename-label helper. Adapt the path-to-tree algorithm. Remove unnecessary arrays of all descendant files from every folder for the read-only explorer; counts and stable identities suffice. The helper iterates Maps/input order rather than sorting itself, so enforce ordering explicitly.
- [app/src/ui/lib/file-tree-folder.tsx](https://github.com/desktop-plus/desktop-plus/blob/1f7efa98e06fc4fd4b5fa2128775f483e3c759c9/app/src/ui/lib/file-tree-folder.tsx): borrow indentation, chevrons, guides, and folder presentation. Remove staging checkboxes and change-specific terminology. Keep this explorer's settings separate from the global changed-file tree toggle.
- [app/test/unit/file-tree-test.ts](https://github.com/desktop-plus/desktop-plus/blob/1f7efa98e06fc4fd4b5fa2128775f483e3c759c9/app/test/unit/file-tree-test.ts): adapt folder grouping, collapse, rename-label, and match-highlight tests. These do not cover root confinement, complete tracked inventories, or large-repository behavior.

Original prototype revision: `dcb5ff2317df76905fccaa05e84847a78daa9d5f`.

- [tree-changes-rows.ts](https://github.com/takaebato/desktop/blob/dcb5ff2317df76905fccaa05e84847a78daa9d5f/app/src/ui/changes/tree/tree-changes-rows.ts): sorted rows, directory identities, and ancestor-aware collapsing. Prefer these correctness ideas over the smaller helper's exact compacted-path lookup.
- [tree-changes-state.ts](https://github.com/takaebato/desktop/blob/dcb5ff2317df76905fccaa05e84847a78daa9d5f/app/src/ui/changes/tree/tree-changes-state.ts): collapse pruning preserves uncompacted ancestor identities. Useful even if compaction is deferred.
- [tree-changes-list.tsx](https://github.com/takaebato/desktop/blob/dcb5ff2317df76905fccaa05e84847a78daa9d5f/app/src/ui/changes/tree/tree-changes-list.tsx): memoized row generation, Left/Right handling, and selection preservation. Adapt narrowly; its Changes filtering and include/exclude behavior are inappropriate here.
- Its `tree-changes-rows-test.ts`, `tree-changes-state-test.ts`, and `ui/tree-changes-list-test.tsx` provide concrete regression scenarios for collapsed ancestors, filtered selection, and keyboard focus. Our proposed filter-reveal behavior differs, so reuse scenarios with the intended expectations rather than copy every assertion.

The inspected DesktopPlus LICENSE is MIT-style with the GitHub copyright and permission notice. Preserve applicable notices and record exact source revision attribution when importing. Recheck the original prototype's license at the chosen import revision before importing its code.

### Reuse code already present in this fork

Paths below are repository-relative implementation references.

| Existing piece | Reuse or adaptation |
| --- | --- |
| `app/src/ui/diff/index.tsx` and `ui/diff/side-by-side-diff.tsx` | Reuse presentation in read-only mode, with staging/discard controls disabled. |
| `app/src/lib/git/diff.ts`: `buildDiff`, `convertDiff` | Reuse parsing, image/binary detection and size limits. Add explicit old/new snapshot support carefully: downstream blob-loading conventions must match the exact endpoints, not infer a parent from an already-resolved endpoint. |
| `getCommitDiff` | Existing first-parent single-commit behavior is the starting point. Verify root commits and historical rename paths. |
| `getCommitRangeDiff` | Do not call unchanged for two selected snapshots: it computes `oldest^` to `newest`. Keep existing range semantics for existing callers. |
| `getWorkingDirectoryDiff` | Reuse ordinary HEAD-to-working-file logic, but not its rename branch unchanged: the source explicitly documents that it diffs a renamed file against the index and can omit already-staged edits. |
| `app/src/lib/git/show.ts` and `app/src/lib/get-old-path.ts` | Reuse historical blob reads and rename path handling; extend to explicit per-endpoint paths and absent-file states. |
| `app/src/lib/git/log.ts`, `git-delimiter-parser.ts`, `models/commit.ts` | Reuse commit metadata format and parsing. Add a dedicated single-path history query; current `getCommits` has no path argument after its final `--`. |
| `ui/history/commit-list-item.tsx`, `expandable-commit-summary.tsx` | Reuse message formatting, author attribution, date formatting and full-message behavior. Extract presentation pieces rather than dragging in squash/reorder or whole-commit changeset dependencies. |
| `ui/lib/list/list.tsx`, `ui/lib/filter-list.tsx`, `ui/resizable` | Reuse virtualization, focus and selection infrastructure, filtering primitives and pane resizing. Implement tree-specific focus/ARIA rules and two-endpoint selection explicitly. |
| `lib/stores/git-store.ts` | Reuse batch-loading ideas. Add per-worktree/file/HEAD request keys and stale-response guards for this view; a global in-flight history key is insufficient. |
| `app/test/unit/git/diff-test.ts`, `log-test.ts` | Reuse repository fixtures and assertions for renames, additions and diff parsing; add tests for the new semantics instead of assuming existing tests cover them. |

`ensureRelativePath` in the existing diff module is Git pathspec formatting, not filesystem-root enforcement. New queries need literal pathspecs for all paths (including names containing `*`, `[`, or `:`), NUL-delimited inventories, and explicit resolved-path containment before disk access. [git ls-files documentation](https://git-scm.com/docs/git-ls-files) describes index inventory, unmerged entries, and NUL output; deduplicate paths across index stages and the HEAD inventory.

## Minimal new implementation

1. A tracked inventory loader and tree state for the selected worktree. Reuse status refresh and tracked paths; avoid filesystem enumeration or per-file stat calls for the whole repository. Read mtime when needed for the selected Current row.
2. A single-file history loader returning commit metadata and path lineage, pinned to a resolved HEAD. Page results and discard stale responses on file, worktree or HEAD changes.
3. An explicit comparison model with two endpoints, each carrying revision or Current, path, existence, and file kind. Keep Current out of the Commit model; never use a fake SHA.
4. A small diff adapter feeding existing rendering and context-loading code from those endpoints. Cache committed blobs by SHA/path and invalidate Current on status/file refresh; mtime alone is insufficient.
5. The Files view, compact/preview rows, endpoint selection, and shortcuts from existing file context menus. Per-worktree UI state must remain separate from repository-wide history selection.

## Acceptance checks before implementation is considered complete

- Untracked and ignored untracked files are absent; newly staged files, staged deletions, dirty tracked files, and sparse-checkout entries are handled explicitly.
- Root containment holds for `..`, absolute paths, Windows drive/UNC paths, symlinks, and intermediate junctions. Worktrees with a `.git` file work normally. Submodules are not traversed.
- One committed revision uses its parent; root commits show additions; two nonadjacent revisions compare exact endpoints; reverse click order gives the same default result; Swap reverses the diff.
- Current works for unstaged, staged, combined, staged-then-undone, deletion, rename-plus-edit, mode-only, conflict, and no-HEAD cases. No missing timestamp is fabricated.
- Rename history spans page boundaries and old paths; ambiguous lineage is not silently presented as proven. Merge histories and nonmonotonic timestamps do not redefine endpoints.
- Image/text/binary/large-file and unavailable LFS cases keep correct endpoint identities. Historical actions never open today's file under a historical label.
- Filtering/collapse preserve stable state; keyboard and screen-reader users can select files and endpoints and read full messages. Large inventories use virtualized visible rows.
- Rapid file/worktree switches and external changes cannot leave another file's diff displayed. HEAD changes invalidate the history cursor. No read-only selection mutates Git state.

## Review limits

This assessment verifies source and public discussion/PR status. No borrowed implementation has been integrated, built, tested, or launched in this fork. The current working tree already contains unrelated WSL and build-troubleshooting edits, which this research does not change. A normal status query could not inspect one submodule because of sandbox access; status with submodules ignored was used to identify top-level edits.

The remaining product choices are proposals: author-date display, uncompressed initial tree, filter auto-reveal, selection replacement behavior, and inclusion of newly staged files as tracked. They refine the agreed workflow without changing the tracked-only or Current requirements.

## Implementation tracking update — 2026-10-28

The research and proposed-design statements above describe the 2026-10-19 assessment. Subsequent implementation is tracked separately on branch codex/file-history-explorer in D:\code\git-desktop\.worktrees\file-history-explorer; see that worktree's TODO.md for its current status. This specification commit does not include that implementation.
