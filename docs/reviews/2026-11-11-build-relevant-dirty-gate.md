# Build-relevant dirty gate review - 2026-11-11

## Scope and source

Request: allow local tagged builds with documentation-only changes, including
untracked runtime-startup and worktree-submodule review reports. Implementation
owner: build_relevant_dirty_check Sol agent. Checkout D:/code/git-desktop,
branch desktop-improvements, base 4ad8284e167b81bacc7b7d11d9a3d7ef2fb0ab16.
Source is uncommitted. Files: script/build-version.ps1 and docs/date-based-builds.md;
this review and docs/Codex-ToDo.md retain the handoff. No commit/build/tag/push
or launcher action authorized or performed.

## Assessment and dispositions

- Accepted/actionable, implemented: the all-path dirty gate rejected untracked
  prose reports. A case-sensitive allowlist now excludes only docs/**/*.md and
  nine exact prose guide paths, documented in date-based-builds.md. Build code,
  assets, config, dependency manifests, unknown paths and Markdown outside the
  allowlist remain relevant. LICENSE remains relevant because packaging consumes
  it. Inspected script/build-local.ps1, script/build.ts, app webpack configuration
  and local packaging flow: the allowlisted prose is not a local build input.
- Accepted/actionable, implemented: apply identical exclusions to initial status,
  final status and tracked/untracked fingerprint data so a documentation edit
  during packaging does not cause finalization failure. Cached diff is included
  separately, preserving detection of staged edits hidden by inverse unstaged
  changes. HEAD changes and conflicts in any path still fail closed.
- Accepted/actionable, implemented: NUL-delimited porcelain status is read directly
  from Git's UTF-8 output, preserving spaces, quoting characters and embedded
  newlines. Rename detection is disabled to classify source deletion and target
  addition separately; a rename crossing the documentation boundary stays dirty.
  Staged, unstaged and untracked records all use this same classification.
- Informational, unchanged: ignored files and submodule contents were already
  outside this helper's source-state check. Existing ignore-submodules behavior
  and AllowDirty preview behavior are preserved. Full upstream sync cleanliness
  remains strict and this change does not authorize a sync, fetch or merge.
- Informational: cooperative sync lock was absent before edits. The normal sync
  status helper could not read restricted submodule metadata in this environment;
  top-level Git status was inspected with submodules ignored. No foreign lock,
  index entries or unrelated review documents were changed.

## Verification and limits

Windows PowerShell parser accepted the revised helper. Read-only classification
checks returned documentation=true for both named review reports and README.md,
and false for docs/script.ps1, app/src/readme.md, package.json and the changed
build helper. Live filtered status retained only the modified build helper;
the modified build documentation and pre-existing untracked reports were absent.
The revised fingerprint completed successfully, without creating build receipts
or tags. Scoped whitespace checks passed. Independent review is recorded below.

No test suite, fixture repository, application build, launch or runtime packaging
was executed. Staged/unstaged rename handling is source-reviewed through Git's
--no-renames status contract; not claimed as runtime-tested. Final tagging,
mid-build edits and packaged artifact acceptance remain unverified. The current
helper modification correctly still blocks a tagged build until committed (or
explicitly built as an untagged AllowDirty preview).

## Independent source review

Reviewer: review_dirty_gate Sol agent; reviewed the uncommitted helper and usage
documentation against base 4ad8284e167b81bacc7b7d11d9a3d7ef2fb0ab16.

- Accepted/actionable, fixed: the initial documentation regex used ordinary dot
  and dollar anchors, which disagreed with the Git exclusion for filenames with
  embedded or trailing newlines. The implementation owner changed it to the
  single-line, absolute-boundary pattern `(?s)\Adocs/.+\.md\z`. Re-read the fix;
  embedded newlines no longer split status records or change extension matching.
- No remaining actionable source findings. The allowlist is limited to prose;
  application Markdown, non-Markdown documentation assets, build scripts and
  dependency/configuration changes remain relevant. Build entry-point and local
  packaging inspection found no consumption of the excluded prose paths.
- NUL-delimited status is decoded before classification, and Git errors throw.
  Disabling rename detection retains both boundary-crossing endpoints. Cached
  and working-tree diffs plus untracked content hashes cover their separate
  source states; initial/final filtered status and fingerprints use the prose
  policy. Conflict rejection and HEAD comparison remain unconditional.
- Existing ignored-file/submodule exclusions and preview/tag behavior are
  unchanged; upstream sync still uses its independent full-cleanliness gate.

This was independent source review only: no tests, fixture repositories, build,
tag, launch, staging, commit or push. Runtime behavior and final tagging remain
unverified. Cooperative sync lock was checked absent before this report edit;
the status helper's restricted-submodule error was not bypassed for upstream
integration. Unrelated review reports and source were preserved.
