# File history explorer independent source review

Reviewed 2026-10-28 in `D:\code\git-desktop\.worktrees\file-history-explorer`, branch `codex/file-history-explorer`, base `376e819596f6f845a1ff8e260622eeeca7707329`. Scope: complete code-written explorer against `docs/plans/file-history-explorer.md`; no production edits or executed tests by this reviewer. The separate test owner records executed validation.

## Findings and final source dispositions

1. **P1 — Revision keyboard navigation did not update controlled selection.** The initial revision List lacked the callbacks that update its controlled selectedRows during Up/Down navigation. **Fixed and independently re-read:** onSelectedRowChanged now updates selection for keyboard sources only, preserving the mouse modifier-click anchor. Executed interaction validation remains owned by the testing agent.

2. **P2 — Routine refresh discarded the user's comparison and pagination.** The initial refresh reselected row zero and reset page depth. **Fixed and independently re-read:** same-HEAD refresh passes the existing limit and preserve flag; selectFile records endpoint revision identities and Swap before clearing transient state, then resolves those identities against the refreshed rows. HEAD changes intentionally invalidate endpoint selection. Prefix reload remains a performance limitation.

3. **P2 — Empty historical comparisons could be labeled as Current.** The initial message used the presence of any Current row. **Fixed and independently re-read:** the Current-specific text now requires from.revision or to.revision to be null, so equal historical snapshots receive the historical empty-state text.

No unresolved P1/P2 source findings from this review remain at the revised code-written freeze. This disposition does not establish runtime or test success.

## Preview findings corrected before code-written handoff

- Staged renames now map their current path to the old HEAD path for committed history, preserving historical rows alongside Current.
- Errors reading Current no longer abort committed-history loading. Failed Current access is represented separately and comparison retries return a visible access error.
- Current submodule directory content is not compared as a deletion; comparison displays a submodule boundary message and does not traverse its contents.
- Historical blob sizes are checked before reading; Current and committed snapshots both reject files above the preview bound.
- Tree selection gained controlled cursor state and Left/Right parent/child navigation.
- Files-tab shortcut switching now leaves Files, and Changes/History context menus gained View File History entry points.

## Verified source properties

- Tracked inventory is a deduplicated HEAD/index union, with staged and unstaged dirty paths. It does not enumerate untracked disk files.
- Current reads resolve repository root and existing ancestor paths to prevent ordinary intermediate symlink/junction escapes; final symlink contents use readlink instead of target reads.
- Explicit snapshot buffers feed the existing Diff renderer and raw diff parser, avoiding the legacy image helper's implicit-parent convention.
- Comparisons use deterministic history-row order and carry per-revision paths; single commits use first-parent snapshots and root commits use absence.
- Comparison and history request generations reject results after a newer selection or unmount. Per-worktree preference keys use repository paths.
- External binary open is a no-op, so historical views cannot accidentally open the working file, although the inherited binary action should eventually be disabled or labeled unavailable.
- Tree attribution references DesktopPlus PR 283's exact revision and the existing license; no whole upstream feature branch was imported.

## Remaining coverage limits

Source review does not establish runtime layout, focus behavior, screen-reader semantics, performance in very large repositories, or successful packaged launch. The tree uses the existing list accessibility model with folder descriptions, rather than a full ARIA tree widget. Commit details now include author/committer dates and local timezone. Pagination reloads an increasing prefix rather than keeping a cursor; this is safe only while the resolved HEAD is stable and may be expensive because each revision performs a changed-file query. These limits must remain visible in the final implementation report.
