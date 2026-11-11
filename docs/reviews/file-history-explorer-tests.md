# File history explorer independent testing

Date: 2026-10-28. Tested assembled worktree: `D:\code\git-desktop\.worktrees\file-history-explorer`, branch `codex/file-history-explorer`, base `376e819596`. Production source was frozen after the code-written handoff and review corrections. Test owner: independent testing agent.

## Results

- New tests: **17 passed, 0 failed** (13 real Git/data tests and 4 mocked UI integration tests).
- Final frozen-source retest after interface naming and lint cleanup: **17 passed, 0 failed**, exit 0, 2026-10-28. Command: `node script/test.mjs app/test/unit/git/file-history-test.ts app/test/unit/ui/file-history-explorer-test.tsx`, with the same installed-Git environment below. Test expectations were unchanged; fixture types were mechanically renamed to follow the implementation interfaces.
- Combined new suites and existing Git diff/log regression suites: **54 tests, 53 passed, 1 failed**.
- The sole regression failure also reproduces on the unchanged source checkout: `git/diff > getWorkingDirectoryDiff > displays a binary diff for a docx file`, `app/test/unit/git/diff-test.ts:294`, actual Text (`0`), expected Binary (`2`). The same assertion fails without the explorer production changes; no expectation or production code was changed to hide it.

Environment: Windows, Node v24.21.0, installed Git via `LOCAL_GIT_DIRECTORY=C:\Program Files\Git`, existing dependency directories reused through worktree junctions. Commands ran outside sandbox for real Git fixture writes, rename and directory-junction fixtures. Initial sandbox run had 7 passes and 6 environmental failures (silent fixture Git failures and EPERM rename/junction creation); it was superseded by the installed-Git run. One UI assertion initially required an exact text node despite surrounding inline text; changed its matcher to a substring regular expression without weakening the expected displayed text.

Command:

```powershell
$env:LOCAL_GIT_DIRECTORY='C:\Program Files\Git'
node script/test.mjs app/test/unit/git/file-history-test.ts app/test/unit/ui/file-history-explorer-test.tsx app/test/unit/git/diff-test.ts app/test/unit/git/log-test.ts
```

Baseline confirmation from `D:\code\git-desktop`:

```powershell
$env:LOCAL_GIT_DIRECTORY='C:\Program Files\Git'
node script/test.mjs '--test-name-pattern=displays a binary diff for a docx file' app/test/unit/git/diff-test.ts
```

## Covered behavior

Tracked inventory excludes untracked files while retaining staged additions and deletions, including an unborn HEAD. Current snapshots use on-disk bytes and actual mtime, including staged-then-undone edits; deletion differs from an empty file and has no invented timestamp. Traversal, absolute paths, and intermediate directory junction escapes are rejected. Committed rename history follows literal bracket filenames and preserves historical paths when a larger history page is requested. Staged rename inventory maps the new name to its committed history.

Exact buffer comparisons and reverse comparisons use the requested endpoints; image diff payloads contain each requested image's bytes; binary and LFS pointer content stay out of text rendering; equal content has no text hunks. Tree construction orders folders before files and filter expansion preserves the collapsed set.

UI integration checks cover actual-parent single selection, exact two-row endpoints and Swap, excluded-file filter hiding/restoration, unreadable Current preserving committed history, and discarding a late history response for the previous file. UI tests mock the shared List/Resizable/Diff presentation and data calls; real Git integration tests cover snapshot reads and diff generation independently.

## Limits

No packaged Electron launch, visual layout acceptance, real virtualized-list keyboard/screen-reader interaction, or large-repository performance benchmark was performed by this test role. Merge-history nonlinear rename ambiguity, sparse checkout, unresolved conflicts, file mode-only changes, symlink creation and submodule boundary behavior were source-reviewed or specified but are not exhaustively exercised in these new tests. No deployment or live production claim follows from these checks.

Fixtures use existing temporary-repository helpers with per-test cleanup. No persistent test repositories or background servers were created.
