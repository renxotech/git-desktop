# Notification dependency repair independent QA

Verified 2026-11-11 by `qa_notification_repair`, independently of production implementation. Scope is the notification dependency preflight/repair process and receipt contract. No application launch, notification delivery, package build, commit or push was performed by QA. The developer performed the real dependency rebuild separately.

## Result and source

Accepted: **19 automated process regressions passed, zero failures or skips** using `node --test script/notification-dependency-test.cjs` on Windows, Node v24.21.0. Tests use disposable synthetic packages, a fake npm lifecycle, and inert text native artifacts which are never loaded. Fixtures are removed after each test, and temporary environment changes are restored.

Tested HEAD: `a3c1d203e2f2e181a38c7a5556bee9868fb55407`, with the six uncommitted production files identified in [the frozen source manifest](notification-dependency-20261111-source.json). QA independently recomputed and matched all six SHA256 hashes after testing. Harness SHA256: `cec8044991f7de0909a6626d0c6f237fdf401520617eed4596c7af340cf5a139`.

The real installed dependency passed the read-only command `node script/notification-dependency.cjs`. Its native artifact independently matched the manifest SHA256 `bb6fa00419c04be9c554d5ce759f3182dca46f8a25437fe8dde4435fde7da8a8`. This verifies source/artifact receipt consistency, not native notification delivery.

## Acceptance coverage

- Matching source, compiled artifacts and receipt pass without changing fixture files.
- Changed installed TypeScript, changed vendor native source, changed compiled JavaScript, changed native binary and missing declaration outputs are rejected.
- Wrong platform or architecture receipt is rejected; explicit npm architecture is honored. The receipt writer records actual native build `target_arch`, independently of a conflicting requested environment architecture.
- Repair refreshes vendor inputs and accepts a newly written lifecycle receipt while preserving an unrelated dependency.
- A lifecycle that exits zero without doing its work cannot reuse the previous receipt; nonzero lifecycle failure leaves the dependency unverified.
- Missing npm invocation and extra obsolete installed source refuse before any fixture file changes.
- Valid and broken junctions in `dist` and `build/Release`, and a package-directory junction, refuse before any fixture file changes, preserving the linked owner.

Node syntax and focused Prettier checks passed for the harness. Production static-check evidence is recorded in the developer manifest and independent source review.

## Findings and limits

- No production defect was found in this QA batch; no production edits were made by QA.
- The first restricted run passed 14 cases and failed five fixture setup operations because Windows junction/rename access was restricted. This was an environment limitation, not application behavior. After creating broken junctions through an initially existing target, the approved run outside those restrictions passed all 19 cases. No test was skipped or weakened.
- Actual native compilation and root TypeScript checks belong to the developer's evidence. QA verified the resulting hashes and read-only preflight. Four pre-existing dependency `WeakMap` declaration errors remain in root TypeScript per that handoff; no clean full-project compilation is claimed.
- Application packaging, Electron startup and delivered notifications remain outside this process-only validation. The Windows host exercised actual junction semantics; other host platform filesystem case behavior remains source-reviewed rather than executed.
- The cooperative sync status helper was blocked by restricted submodule metadata. The Git common directory's sync lock was checked directly and absent before QA edits. QA changed only the harness and this report; the developer owns task-ledger updates.
