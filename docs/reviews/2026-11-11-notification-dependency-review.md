# Notification dependency repair independent review

Date: 2026-11-11. Reviewer: `review_notification_repair`; developer:
`repair_notification_dependency`. Scope: `script/notification-dependency.cjs`,
`vendor/desktop-notifications/script/build-receipt.cjs`, vendor install lifecycle,
root repair command and Windows local-build preflight. Main checkout HEAD observed
as `a3c1d203e2f2e181a38c7a5556bee9868fb55407`; implementation is uncommitted.

## Assessment

The source/input and compiled-output hashes address the reported copied dependency
drift without weakening the application's boolean initialization contract. Build
preflight is read-only, repair is explicit, and a failed repair cannot issue a new
successful receipt. Independent source review is complete with no remaining
blocking source finding after the corrections below. Developer compilation and
independent process-test evidence remain separate acceptance gates.

## Findings and dispositions

1. **P1, accepted and corrected: protect generated-output paths before repair.**
   The initial repair checked copied source descendants but allowed linked
   `dist`/`build` output trees. TypeScript or node-gyp could write through those links
   into another checkout. The revised implementation walks the complete installed
   package with `lstat` before its first mutation and refuses symbolic links,
   including output descendants. Package ownership also checks its resolved path.
   This is a cooperative local safety check; concurrent filesystem replacement
   after inspection is outside its protection.
2. **P2, accepted and corrected: obsolete installed inputs must fail before writes.**
   Copying only current vendor inputs left deleted/renamed old installed source
   files. The receipt writer included those extras, so the final expected-input
   comparison could never succeed. The revised code refuses obsolete `lib`, `src`
   and `script` files before copying and explains that a fresh dependency install
   belongs in the dependency owner's checkout. It deliberately does not delete
   unknown files. An obsolete-source installation therefore needs a separate
   deliberate install rather than the narrow repair.
3. **P2, accepted and corrected: preserve case-sensitive ownership checks.**
   The initial real-path comparison lowercased on every platform. A case-variant
   link could therefore compare equal on a case-sensitive filesystem. Case folding
   now applies only on Windows.
4. **P2, accepted and corrected: distinguish produced native architecture from Node architecture.**
   The initial receipt used `process.arch` for the produced binary. The repository
   supports `npm_config_arch` cross compilation in `script/dist-info.ts`, and
   node-gyp uses its configured target architecture. An x64 Node process can build
   an arm64 binary and incorrectly certify it as x64. The final receipt reads the
   actual `build/config.gypi` target architecture and preflight compares it with
   `npm_config_arch` when set, otherwise the consuming Node architecture.
5. **Informational, assessed: direct lifecycle uses explicit N-API version.** Direct `npm run install` in the installed
   package is narrower than npm rebuild of a file dependency, but does not have
   `app/.npmrc` as its project configuration. The final lifecycle explicitly passes
   `--napi_build_version=4` to node-gyp, consistent with the existing binding's
   `NAPI_VERSION` macro and package's N-API 4 configuration. No independent
   Electron/V8-facing binding was found in this narrow source review. This resolves
   the required N-API build-input ambiguity by source; actual Electron loading and
   notification behavior remain runtime acceptance limits.

## Reviewed source snapshot

SHA-256 values for the reviewed uncommitted implementation:

| File | SHA-256 |
| --- | --- |
| `script/notification-dependency.cjs` | `34564F65A36E5A07B1A2B0F7D275376F1ED714B1FB565D58D058895C12699BCB` |
| `vendor/desktop-notifications/script/build-receipt.cjs` | `C4FBF25941E25293D504C7B70C7A98C942FDF7AD399D0904AC47BFCAE23B0D6F` |
| `vendor/desktop-notifications/package.json` | `46977E2DB7A06DF11054D0FB23E623AEA7A9034AD508065097869148D03491E2` |
| `package.json` | `9F938AC04CD251D1B9F2BD551C7E3AAA74209FE2A80F5FC969BA634709E7C441` |
| `script/build-local.ps1` | `F1BD4A68A7D7BF5F195FA6CADA4FDC41F8EB6922BA9F15D25B26936BD9C5BD69` |

## Verification and limits

The reviewer read applicable repository guidance, the task index, relevant npm
manifests/configuration, binding/TypeScript configuration, native wrapper contract,
build entry points and node-gyp's local architecture handling. Full Git/submodule
status and the normal sync status helper fail on restricted choosealicense.com
metadata; top-level status was inspected with submodules ignored. Direct inspection
found no cooperative sync lock before this report edit. No staging or index changes
were made by the reviewer.

No tests, repair, dependency installation, native compilation, package build, app
launch, frontend/manual/device testing, server access, commit or push were performed
by the reviewer. Developer validation must be recorded separately and attributed.
The separate notification worktree's runtime acceptance remains with its existing
owner; this review does not establish live notification behavior or package startup.

Receipts detect drift in the listed package sources, emitted JavaScript/type
declarations and native binary, not malicious receipt forgery or every toolchain,
transitive dependency and SDK change. Missing/broken inputs fail closed. Shared
dependency checks protect explicit repair; read-only preflight may use a shared
installation only when its recorded bytes match this checkout's required inputs.
