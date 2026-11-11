# Versioned local build outputs — 2026-11-11

Request: put default `build.cmd` packages in the generated version folder and
attempt cleanup of older outputs after a successful build. Source-only scope;
no build, launch, commit, push or deletion of existing user outputs authorized
for this implementation/validation pass.

Decision: default parent is `dist/<Label>`; the existing packager retains its
`GitDesktop-win32-x64` child. Explicit `-OutputDirectory` still chooses the parent.
Only after `Complete-DesktopBuildVersion` succeeds does the automatic parent
receive an ownership receipt and cleanup run. Explicit outputs are never enrolled;
explicit reuse of a formerly automatic output removes its ownership receipt.

Source assessment and dispositions:

- Accepted/fixed: fixed default output blocked builds while the previous app ran.
  New labels isolate packages; the process check applies to the selected output.
  Rebuilding the same dirty label still uses that same folder and requires its
  running app to close; dirty preview numbering semantics are unchanged.
- Accepted/fixed: names alone cannot establish disposable ownership. Cleanup
  requires marker schema/kind/checkout/version, matching build-info schema/version,
  and an executable. Existing `dist/build-2026-11-11` has a build receipt but no
  automatic marker; all existing custom/legacy outputs remain untouched.
- Accepted/fixed: compare parsed numeric year/month/day/counter, so `_100` sorts
  after `_99`. Equal versions (including clean/dirty labels), current and newer
  directories are preserved. Launch selection uses numeric version, then build time.
- Accepted/fixed: deletion is restricted to direct version children of the absolute
  checkout dist root. Ancestor links, marker/manifest/executable links and linked
  descendants are refused. Descendant inspection does not traverse links.
- Accepted/fixed: cleanup/marker failures warn after successful version finalization;
  they do not fail the completed build. Cleanup never runs after failed compile,
  packaging, source-drift detection, tag creation, or launch-only/explicit-output runs.
- Accepted/fixed: both normal launcher and `-LaunchOnly` resolve completed automatic
  outputs and retain the legacy fallback; custom outputs require explicit selection.
- Informational: this is a cooperative local ownership receipt, not protection
  against a malicious concurrent filesystem writer. Build outputs must not be edited
  or moved concurrently with packaging/cleanup. Locked deletion may partially remove
  an older output before warning; new output is preserved.

Validation: Windows PowerShell parsing passes for build-local.ps1, build-output.ps1
and find-local-build.ps1; scoped whitespace checks pass. No application/frontend tests,
full compile/package, launch, actual cleanup or live acceptance performed.

## Independent source review

Reviewed the four changed/new entry points plus `build-version.ps1` and
`package-local.mjs`, and the current contribution/development/sync guidance.
An escalated read-only sync status check succeeded: checkout dirty, no active
sync lock reported. No builds, tests, launches or output deletion were run.

- No remaining actionable source findings. Cleanup enumerates direct `dist`
  version children, requires matching ownership and build receipts, rejects
  linked paths/descendants, rechecks deletion containment, preserves equal/newer
  versions, and only runs after version finalization returns successfully.
  Numeric version comparison and timestamp tie-breaking support launcher ordering.
  Explicit output reuse revokes automatic ownership; explicit and launch-only
  paths do not run automatic cleanup. Locked deletion warns without invalidating
  the new completed build.
- Disposition: initial stale-receipt concern was overstated for the existing
  packager. It stages the package and replaces the entire executable child,
  removing the previous build-info receipt before finalization. The revised
  builder also revokes parent ownership before rebuilding an owned output;
  recreation remains after successful finalization. This is conservative defense.
- Informational recovery limit: a failed rebuild after ownership revocation (or
  any first failed build leaving its default directory) requires selecting that
  directory explicitly to retry, or preserving/relocating it first. Default
  overwrite protection intentionally refuses directories lacking completion
  receipts. No automatic recovery/deletion was exercised.
- Verification limits: conclusions are source-only. Windows handle-lock behavior,
  junction/reparse handling, command-shell launcher behavior and end-to-end
  packaging/cleanup remain unexecuted. Cooperative receipt trust does not protect
  against concurrent hostile filesystem mutation; partial deletion remains a
  documented best-effort limitation.
