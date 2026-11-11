# Static resource staging: independent remaining-change review

Date: 2026-11-11. Reviewer: review_build_resources_independent. Worktree:
`D:/code/git-desktop/.worktrees/submodule-junction-cleanup`.
Branch: `codex/submodule-junction-cleanup`. Reviewed HEAD:
`38acde9749d7edcf6c00794f7ef7ee7f0335d6e5`.

## Decision

Accepted by independent source inspection. No actionable production defect
identified in the remaining three-file patch. These are source and regression
test files worth committing together; they must not be ignored as generated
build output. The change fixes future resource preparation and does not repair
an already staged or packaged application.

## Reviewed behavior and evidence

- `script/build.ts:97` supplies the same checkout-local platform/common/static
  paths as the previous inlined implementation. Its call remains before
  `generateLicenseMetadata` and before either packaging path can consume the
  staged resources.
- `script/static-resources.ts:12` rejects the exact entry basename `.git`,
  including files, directories and links, at every visited level. Windows
  compares case-insensitively; other platforms use exact-case comparison.
  Other Git-prefixed assets are not rejected.
- `dereference: true` materializes the linked tree before later packaging can
  copy it. This is necessary to apply the exclusion to a junction's descendants.
  The installed Node implementation of `internal/fs/cp/cp-sync` was inspected:
  the filter runs before descendant `getStats`, and traversal uses `statSync`
  with dereferencing enabled. A filtered `.git` subtree is not opened.
- Destination recreation and platform-first/common-`force: false` precedence
  are preserved. A missing platform directory remains optional. Missing common
  resources fail the copy instead of reusing an old static directory, since the
  destination has already been removed. The required license repository also
  fails later license generation when its payload is missing.
- The helper writes only its supplied staging destination and reads source/link
  targets. Current production callers supply fixed established paths. It adds no
  source deletion, target Git operation, repository cleanup exception or
  external-target mutation. The trusted staging-path/ancestor assumptions are
  inherited from the old copy; this is not a general safe arbitrary-path copier.
  Cyclic, dangling or unreadable eligible resource links can fail preparation.
- Runtime gitignore consumers enumerate/read template assets rather than
  repository metadata. License generation consumes `_licenses` and
  `LICENSE.md`, then generates `available-licenses.json` and the attribution
  file before removing only the copied license source. Required consumers remain
  satisfied by the staged payload.

## Cache, generated files and provenance

`script/build-local.ps1:118-124` always runs resource preparation after Webpack
for an actual build. Both `build:dev` and `build:prod` also run `build.ts`
after compilation. Therefore Webpack cache hits cannot skip this static
directory recreation, copying, filtering or license regeneration. The helper
is executed by ts-node rather than emitted by the Webpack cache, so adding it
to Webpack build dependencies is unnecessary for this change.

Direct `npm run package:local` copies the existing `out` directory without
resource preparation. It cannot establish that an old staged bundle contains
this fix. Use the normal build pipeline or an explicitly prepared frozen bundle
for any later package acceptance. No current package acceptance is claimed.

The local build fingerprint includes tracked script changes and untracked
script source bytes, so these source files cannot be hidden from build identity
by treating them as output. As documented in `docs/date-based-builds.md:74`,
ignored files and submodule contents remain outside that fingerprint. Prepare
and freeze dependency/submodule resources before a later provenance-sensitive
build. That existing limitation is not expanded or fixed by this patch.

## Tests and dispositions

1. **Accepted; no source fix needed.** The five existing test cases use the
   actual exported helper, cover root/nested Git files and directories in both
   overlays, exact retained assets, stale output, precedence, missing platform,
   host case semantics and a real directory junction with unchanged external
   target/link inventories. Tests are discovered by the existing script harness.
2. **Informational coverage limit.** Individual file-link materialization,
   dangling/cyclic links, missing common resources and non-Windows execution
   are not directly covered by this five-case suite. The first is supported by
   inspection of the installed Node copy implementation; failure cases preserve
   fail-fast preparation semantics. No additional blocking regression test
   requirement was identified for the narrow metadata exclusion fix.
3. **Informational evidence reuse.** Previous independent source-review and QA
   receipts in `docs/reviews/2026-11-11-packaged-git-metadata-independent-review.md`
   and `docs/reviews/2026-11-11-packaging-git-metadata-qa.md` identify exactly the
   same source/test hashes. Their 5/5 Windows helper result is historical
   evidence, not a new run by this reviewer.
4. **Informational execution limit.** Ordinary status and the cooperative sync
   status command fail on protected submodule metadata. Scoped status with
   submodules ignored identifies only these remaining source changes. Direct
   shared sync-state inventory found no `lock` before this report write.
   Source-only review does not override the committing owner's lock,
   ownership or validation checks.

## Frozen review identity and limits

SHA256 values were verified before and after source inspection:

- `script/build.ts`:
  `d01d38a6025eb99f496e0332e4d9e23d03bfd101c6092f7620b41e6697274840`
- `script/static-resources.ts`:
  `ac6583a39c83083d9654d1ea363706ccff1309ee929775f1e357e749551fe572`
- `script/static-resources-test.ts`:
  `cae0249192484a3d258d9407018f1601b8a1e48ab5627c3ce47bf3bbdfa66009`

This reviewer made no production/test edits and ran no tests, compilation,
build, UI/manual checks, cleanup, commit, push or remote operation. This report
is the only authored file. Review/validation/integration ownership remains with
`review_remaining_changes`; the shared task ledger was not edited.
