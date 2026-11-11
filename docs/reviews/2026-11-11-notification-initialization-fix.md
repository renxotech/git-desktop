# Notification initialization correction — 2026-11-11

## Scope and source

User authorized notification fixes and tracing DEP0169 in an isolated local
branch/worktree, tracking the existing remote desktop-improvements. Worktree:
`D:/code/git-desktop/.worktrees/notification-initialization`; branch
`codex/notification-initialization`; base
`d95892e06f3290f4aa97a12a7b9869470cd7258a`; upstream
`origin/desktop-improvements`, https://github.com/renxotech/git-desktop.git.
Local source commit authorized; no push requested. Main checkout's unrelated work remains
preserved. Follow-up user authorization permitted bounded isolated startup
tracing without repository actions or UI tests. The user's latest direction is
to build/run with trace themselves; no further app launch or package build by
agents. Instructions: [build and trace](../notification-build-and-trace.md).

Original diagnosis is retained in main checkout at
`D:/code/git-desktop/docs/reviews/2026-11-11-runtime-startup-errors.md`.
Its R1/R2 source changes and R3 trace are now authorized in this task.

## Acceptance and implementation

1. Portable unregistered launch does not fabricate a working notification
   identity. Fork shortcut discovery uses Electron appData/Desktop known folders,
   requires the fork AUMID and valid activator GUID from the same shortcut, and
   reports one informational unavailable state rather than missing-path errors.
   Existing upstream GitHub Desktop shortcuts remain untouched.
2. Installed fork launch uses its discovered AppUserModelID/CLSID. The process
   identity is set before native setup. Native readiness requires successful
   Windows Runtime setup, toast factory, AUMID and activator registration.
3. Native setup queries the existing COM apartment and selects compatible STA
   or MTA WinRT initialization. Failed candidates are not published. Successful
   initialization, including S_FALSE, is balanced on teardown; COM references
   release before WinRT uninitialization. Registration teardown runs only after
   successful registration. The WRL singleton no longer retains a callback to a
   discarded candidate.
4. Facade calls before initialization or after failed setup return default
   permission/false/null or no-op without loading/using a partial native manager.
   Duplicate successful initialization is idempotent; failures remain retryable.
   Windows requires an explicit native true result; a stale void-returning
   Windows addon cannot masquerade as ready. macOS's existing void native
   initialization result remains compatible.
5. Attribute DEP0169 to the actual observed chain where possible; no wholesale
   suppression or speculative global URL replacement. Independent clean-profile
   startup trace reached main-ready and renderer bootstrap, emitted no calls to
   url.parse and no DEP0169. Thus the original warning's caller depends on
   startup/account/repository state absent from the disposable profile; exact
   attribution remains unconfirmed without the original-state reproduction.

## Immutable validation handoff

Nine production files are recorded in
[SHA256 manifest](notification-init-source-manifest.json) and
[saved diff](notification-init-source.patch). No source changes during validation.
The independent reviewer/validator is `notification_review` Sol agent.

- Complete app TypeScript `tsc --noEmit --skipLibCheck`: PASS.
- Vendor TypeScript `tsc -p vendor/desktop-notifications/tsconfig.json`: PASS.
- Focused Prettier, ESLint autofix and whitespace checks: PASS. Scoped lint used
  the existing missing-installed-rule exception for no-empty-object-type;
  no shared dependency/configuration was changed.
- Native Windows C++ compile and link: PASS, N-API v4, installed Node 24 headers.
  Initial node-gyp linker configuration expected Release/node.lib instead of the
  installed cache's x64/node.lib. Corrected only the generated isolated vcxproj
  path; no source/cache edit. Logs retained in ignored task root
  `out-native-compile.log` and `out-native-link.log`.
- Isolated app dependency `desktop-notifications` resolves to this task's
  `vendor/desktop-notifications/dist/index.js`, with compiled addon under its own
  build/Release. Other dependency junctions reuse installed inputs read-only.
  No old shared installed vendor copy was edited or used as source acceptance.
- Independent backend/process-side contracts and source review: PASS, no
  remaining actionable source findings. Nine wrapper checks, fifteen
  identity/main-process checks and nine trace-hook checks (33 total), plus
  actual rebuilt native addon missing-AUMID/retry/default/teardown check pass.
  [Independent acceptance](evidence/notification-init-20261111/independent-acceptance.json)
  records exact nine-file hashes. No frontend/renderer/UI test suites run.
- Final app TypeScript including the new hook: PASS. Hook/main/renderer scoped
  formatting/lint passes; the pre-existing main.ts require at line 831 needed
  its no-var-requires baseline exception, rather than unrelated source edits.
- Trace hook installs first in main and renderer. Only explicit trimmed,
  case-insensitive `true` plus a nonempty path enables it. Writes start markers
  and DEP0169 warning stacks, preserves ordinary warnings and parser behavior,
  and catches synchronous/callback/closed-console failures. No URL arguments
  or account contents intentionally logged. Independent strict flag, both
  process types, warning selection/listener and failure contracts pass.

## Findings dispositions and remaining evidence

- R1/R2 accepted and source-written; independent source/contract acceptance
  complete. Installed/portable runtime app acceptance is user-owned pending.
- R3 accepted trace task; bounded clean-profile trace complete without
  reproduction. Exact-caller attribution is blocked on original-state evidence
  or further user-authorized trace; no URL parser source change made without
  attributing the warning. Preserved evidence under
  `evidence/notification-init-20261111/file-backed-{main,renderer}-trace.jsonl`
  and `file-backed-run.json`; the owned process exited normally, no owned app
  processes remained, and protocol registration writes were blocked. Earlier
  restricted attempt exited 0x80000003 without output; normal-access
  imports-only attempt reproduced original notification failures but no DEP0169.
- Prior Electron requested-target/package-runtime mismatch is informational and
  excluded; no dependency upgrades authorized or performed.
- Runtime installed notification delivery/Action Center acceptance is not
  established by compilation. No shortcut mutation, live server/database access,
  app packaging, source commit, push or merge performed.

The common sync lock was absent before writes. The main checkout status helper
cannot inspect restricted submodule metadata; direct common lock and top-level
status checked. No upstream integration/post-commit operation triggered.

## Runtime regression R4 — read-only trace flag

The user-built `v2026.11.11_03-dirty` package included the accepted notification
source and native binary, but the user's traced launch failed in the helper with
`TypeError: Cannot assign to read only property 'traceDeprecation'`.
This was a helper defect: it wrote `process.traceDeprecation = true`, which the
actual Electron process exposed as read-only. Previous process-side tests used a
mutable fake process and missed this property-descriptor case; they did not
establish successful Electron startup.

Disposition: accepted/actionable and corrected in source by removing that write
entirely. The existing warning listener still records `warning.stack`; the user
launch option `--trace-deprecation` controls the ordinary warning presentation.
No process-property mutation, parser replacement or warning suppression is
needed. Main/renderer early installation and optional guarded file output remain.

Current helper SHA256:
`a2f8e7d42d281de4f01b6f934fb311fdb03471f8d069cc53a761944f6ece22ba`.
Current nine-file source manifest/diff refreshed; original package and original
acceptance receipt remain historical evidence. Complete app TypeScript, helper
formatting/lint and scoped whitespace passed after this correction. Independent
regression validator passed thirteen diagnostic contracts, including read-only
true/false properties with descriptors unchanged and warning stacks retained,
a non-extensible process and the negative original-assignment fixture. The
validator also independently confirmed that real Node launched with
`--trace-deprecation` exposes this property as `writable: false`, reproducing
the exact cause outside Electron. Prior notification/backend acceptance remains
applicable to the eight unchanged production files. Actual plain Node
`--trace-deprecation` helper smoke also PASS: startup marker and synthetic
DEP0169 stack persisted, default stderr warning retained and descriptor
unchanged. [Independent regression receipt](evidence/notification-init-20261111/independent-readonly-regression.json)
preserves this evidence. No Electron app launch was performed by agents.

User owns rebuild/run; no new package build or app launch by agents. The guide
now targets `dist/notification-init-tracefix-20261111`, preserving the old package
and avoiding its executable locks. Runtime acceptance and original-state
DEP0169 caller attribution remain pending user-supplied trace output.
