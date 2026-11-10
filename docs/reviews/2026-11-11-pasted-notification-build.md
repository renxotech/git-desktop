# Pasted notification build assessment - 2026-11-11

## Scope and source

User supplied the CMD build log for `D:/code/git-desktop/.worktrees/notification-initialization`, branch `codex/notification-initialization`, base `d95892e06f3290f4aa97a12a7b9869470cd7258a`. Investigation and narrow build-tool corrections are in the main checkout, `desktop-improvements` at `2fd9f9e1945e4f2cdde428a762fe3be0a4c36a1f`. Notification edits, output and its independent owner's source manifest are preserved. No merge, commit, push, release tag, package build, application launch or cleanup is authorized/performed by this investigation. No server access.

Input: `C:/Users/vinni/.codex/attachments/f2bb8cd0-22be-4656-9a05-7ec16ea3bb1c/Pasted text.txt`. Source references below describe current inspected local files. Main checkout changes have not been copied to the notification worktree.

## Findings and dispositions

### B1 - CMD quoting creates build output among source inputs (accepted, source corrected)

CMD treats single quotes as literal path characters. The pasted `-OutputDirectory 'dist/notification-init-20261111'` therefore packaged into a root folder literally named `'dist`, with a child `notification-init-20261111'`. Inspection finds 738 nonignored untracked package files below that folder. They participate in the task worktree's `Get-DesktopSourceFingerprint` (`git ls-files --others --exclude-standard`) and final status comparison. Creating or replacing them during packaging changes the source identity. This is a sufficient explanation for the finalization refusal. The exact starting status/fingerprint was not persisted, so additional concurrent edits cannot be ruled out.

The log shows compilation/resources/packaging succeeded, followed by a source-state rejection. The executable exists but that attempt did not write a completed build-info receipt or create a tag. It was already a dirty preview and would never create a release tag even on successful finalization.

Main `script/build-local.ps1` now rejects literal apostrophes in an explicit output argument, before version allocation/build work, explaining CMD's double-quote syntax. This deliberately rejects a legal but ambiguous apostrophe-containing custom path instead of silently rewriting the user's destination. Correct CMD spelling:

```cmd
build.cmd -AllowDirty -NoLaunch -NonInteractive -OutputDirectory "dist/notification-init-20261111"
```

The original quoted folder remains preserved. It continues to count as untracked source in that old worktree; while unchanged it forms part of the next dirty preview fingerprint, and it prevents a clean tagged build until explicitly dealt with. No broad output exclusion or weakened source guard was added. Custom outputs outside ignored paths still trigger the existing guard if they create untracked files during a build.

### B2 - JSON named re-export warning (accepted, source corrected)

`app/src/lib/branding.ts` re-exported a named property from a default-exporting JSON module. Main now default-imports the package JSON and exports `UpstreamVersion = packageInfo.upstreamVersion`. Public consuming imports remain unchanged. This addresses the exact webpack warning without changing the upstream version value or consumer behavior.

### B3 - Analyzer exposes invalid classic-script syntax (accepted, source corrected; package validation pending)

The emitted task `out/205.js` is a classic `global.webpackChunkgithub_desktop_build.push(...)` chunk, containing raw `import.meta.dirname` inside bundled Koffi 3.2.1. A read-only `vm.Script` parse reproduces `SyntaxError: Cannot use 'import.meta' outside a module`. Parsing does not execute the app or native addon. The analyzer failure therefore exposes an actual lazy-chunk parse hazard, not merely an analyzer display incompatibility. It does not prove the notification code caused the issue or that ordinary startup loads this chunk.

Trace: installed `@github/copilot-sdk/dist/client.js` dynamically imports `ffiRuntimeHost.js`, which imports `koffi`. Installed Koffi publishes separate import (`index.js`) and require (`index.cjs`) entries. Its ESM implementation uses `import.meta.dirname`, left raw by installed webpack 5.104.1; the published CJS implementation uses `__dirname` and `__filename`. The existing helper selected one native target but did not select the wrapper format.

Main `script/webpack-koffi.ts` now aliases the exact `koffi` request to its published require entry, resolved from the supplied dependency root. Existing target-native eager resolution, exact target alias and ignore-other-platform behavior remain. It does not edit installed dependencies or change the SDK globally. Existing test fixture now supplies its read-only installed Koffi package through a temporary junction because the helper eagerly resolves that wrapper; no tests were executed.

This is source-level correction only. Rebuilding and checking final emitted code/native SDK behavior remain excluded. No claim of runtime success is made.

### B4 - Generated tracked file suspicion (informational; no supporting evidence)

`script/licenses/update-license-dump.ts` writes to its `outRoot/static/licenses.json`; resource/license outputs live below ignored `out`, not a tracked source dump. Current task tracked diff contains only the eight notification production files already listed in its prior source handoff. No extra tracked generated change is present. Missing original start-state evidence prevents proving every mid-build event, but no generated tracked file workaround is justified.

## Validation and boundaries

- Script TypeScript `tsc -p script/tsconfig.json --noEmit --skipLibCheck`: passed.
- PowerShell parser for changed builder: passed. Scoped whitespace: passed.
- Read-only existing chunk parse: fails as above, confirming B3.
- Application TypeScript `tsc --noEmit --skipLibCheck`: passed. Scoped Prettier and ESLint with repository custom rules pass; only pre-existing unavailable `@typescript-eslint/no-empty-object-type` disabled. Initial invocations with the wrong Prettier binary path and without custom ESLint rules were corrected; no source finding resulted.
- No frontend/UI/manual tests, script test execution, compilation/package build, tag creation, launch or deletion. Existing source guard unchanged.
- Sync status helper failed on restricted submodule Git metadata; common-directory cooperative lock checked directly absent before edits. Top-level status with submodules ignored was inspected. Full submodule cleanliness is not claimed. Existing unrelated review documents preserved.

## Resume

Independent review complete below. Source correction scope: `app/src/lib/branding.ts`, `script/build-local.ps1`, `script/webpack-koffi.ts`, `script/webpack-koffi-test.ts`. Main source is uncommitted. Coordinate with the notification task owner before any selective transfer; avoid overwriting that worktree's older builder wholesale or changing its nine-file source manifest. User owns the next package/run, and existing quoted output requires explicit preservation/cleanup choice before a clean build.

## Independent source assessment

Reviewer `review_build_log_fixes` independently inspected the four-file diff against Koffi 3.2.1 package exports, both wrapper implementations, static native loader, renderer configuration, source guard and JSON compiler settings. No blocking production findings. The exact `koffi$` alias selects the declared CJS entry and leaves subpaths untouched. The CJS wrapper preserves SDK-visible API functions through default interop, uses Node `__dirname`/`__filename`, and retains native platform selection plus target-only alias/ignore behavior. Quote rejection precedes version calculation/output mutation and preserves dirty-source protection. The fixture's dependency junction permits eager wrapper resolution while exact target aliases still select native stubs.

Reviewer identified an accepted regression-coverage gap: asset checks alone would not detect raw `import.meta` returning. The existing fixture now parses emitted `bundle.js` using `vm.Script`; the assertion was authored, not executed. Developer reran script TypeScript, scoped formatting/lint and whitespace after this addition; all passed. No new production change followed independent review.

Review limits: source assessment only, no package/runtime/native-load success claim. Reviewer performed no edits; its assessment is incorporated here by the implementation owner to avoid concurrent documentation writes. Both agents' full submodule status remained restricted, and developer separately verified cooperative lock absent before writes.
