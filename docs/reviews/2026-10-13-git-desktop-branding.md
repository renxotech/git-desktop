# Git Desktop branding

## Approved scope

Replace application identity artwork with the official orange Git mark, clarify
Welcome and About wording, preserve upstream attribution, and route fork feedback
and release links to `https://github.com/renxotech/git-desktop`.

## Changes and decisions

- Official vector source: `app/static/logos/git-mark.svg`; Jason Long, CC BY 3.0.
- Production and DEV-badged SVG, Windows ICO (16–256 px), macOS ICNS (16–1024 px),
  Icon Composer source, Linux PNG, About PNG, and installer artwork are derived
  from that source by `script/generate-branding.mjs`.
- Welcome describes repositories, branches, and worktrees, with an explicit
  “Continue without signing in” action and a Git branch illustration. GitHub
  sign-in still identifies GitHub. The custom title bar uses the same Git mark
  at 16 px rather than its previous GitHub symbol.
- About identifies the GitHub Desktop upstream and links this fork's project,
  releases, and issue tracker. Open Source Notices include the logo credit.
- Help feedback and crash reports target this fork. Upstream guides, original
  authorship, license text, service names, and OAuth permission names are retained.
- Package repository metadata identifies the fork; publisher metadata uses
  “Git Desktop contributors” rather than claiming publication by GitHub, Inc.
- Installation IDs, executable names, credential keys, profiles, and authentication
  protocols are preserved. No version bump, commit, push, or release is requested.
- macOS packaging uses the generated ICNS rather than the upstream `Assets.car`
  catalogs. Modern Icon Composer sources can be compiled on a Mac; macOS release
  acceptance requires platform verification.

## Validation

- **26 focused tests passed:** main-process menu construction/access keys,
  tutorial Welcome surfaces, Welcome/sign-in wrappers, and Welcome persistence.
  Command: `node script/test.mjs app/test/unit/main-process/menu-test.ts
  app/test/unit/ui/tutorial-welcome-surfaces-test.tsx
  app/test/unit/ui/welcome-and-sign-in-wrappers-test.tsx
  app/test/unit/welcome-test.ts`.
- Full production webpack compilation passed. Final main-process and
  renderer/crash rebuilds also passed after the last UI/link changes.
- Production staging passed, including static resources, Sass-variable
  validation, and license-notice generation. `node script/package-local.mjs`
  produced `dist/GitDesktop-win32-x64/GitDesktop.exe`.
- The final packaged executable was launched through Playwright in an isolated
  profile with separate global/system Git configuration. Welcome's continue
  action, About, attribution, title-bar SVG decoding, and the 16 px title-bar
  icon all passed. No renderer errors were reported. The QA app was closed.
- Pillow decoded Windows ICO and macOS ICNS assets. Windows ICO includes 16,
  20, 24, 32, 40, 48, 64, 128, and 256 px; ICNS includes up to 1024 px.
- Prettier and `git -c diff.ignoreSubmodules=all diff --check` passed.
- Normal ESLint is limited by the installed plugin lacking the configured
  `@typescript-eslint/no-empty-object-type` rule. Scoped lint passed with that
  rule disabled and the pre-existing `no-var-requires` build-script warning
  disabled. Project lint configuration and dependency versions were not changed.
- Webpack's bundle analyzer warned about `import.meta` in an existing vendor
  chunk; compilation itself succeeded. Existing React warnings appeared in
  the sign-in test harness; tests passed.

## Visual evidence

- [Production and development icons](assets/2026-10-13-branding/icons.png)
- [Packaged Welcome screen](assets/2026-10-13-branding/welcome.png)
- [Packaged About screen](assets/2026-10-13-branding/about.png)
- [Git logo attribution](assets/2026-10-13-branding/notices.png)

## Verification limits

This is local Windows x64 build and packaged-app evidence. A Squirrel installer
was not generated or installed, and remote project/release links were not
published or tested against a new release. macOS and Linux assets were generated
but those platforms were not run. No commit, push, or deployment was performed.

## Requested Test build (2026-10-13)

- Built the main checkout's current source, including the uncommitted branding
  changes, with `DESKTOP_BUILD_TARGET=test` and production compilation.
- `yarn build:test` compiled all bundles successfully. Initial Electron
  packaging failed on sandbox DNS (`ENOTFOUND github.com`). Retrying only the
  build/staging/packaging step outside the sandbox succeeded with Electron
  44.1.1; no source changes were needed.
- Artifact: `dist/GitDesktop-Test-win32-x64/GitDesktop-Test.exe`, version 3.6.7,
  packaged product name `Git Desktop-test`, built at 10:47:50 IST.
- Test executable SHA256:
  `6122D39994DD1A0BA647937AC708CD1B9F8C5295502E609FFF27874B5BB93A53`.
- The packaged Test app passed startup, runtime test-identity and executable-path
  checks, Welcome continuation, About, logo decoding/size, and attribution in a
  separate QA profile with isolated Git configuration. No renderer errors were
  reported. The QA app was closed after verification.
- Production executable SHA256 remained
  `117DBA24CA53DC556C03419466C8995B0C129D24324E9CA84EB103A057727017`.
  Permanent Prod/Test profiles were not refreshed or used for the smoke test.
- [Test About screen](assets/2026-10-13-branding/test-about.png) and
  [Test Welcome screen](assets/2026-10-13-branding/test-welcome.png) record the
  packaged build. No installer, commit, push, or deployment was requested.

## Profile-context reconciliation (2026-10-13)

Reviewed the full conversation “Git Desktop config and multiple Environments”
(`01a13152-00ba-7bd3-826c-78e7f36360bb`) after the user's profile/name question.
Its approved setup uses permanent, independent profiles: Prod `Git Desktop`,
Test `Git Desktop-test`, and Dev `Git Desktop-dev`. The user requested one-time
copies from Prod and later explicitly requested an optional refresh command;
no permanent link between Prod and Test was agreed. The matching source and
workflow are documented in `docs/prod-test-builds.md`.

Current source and the built Test package confirm product name
`Git Desktop-test`, version 3.6.7. The branding diff did not change the existing
base product name (`Git Desktop`) or `app/package-info.ts` profile suffix logic.
The upstream name `GitHub Desktop` is a separate historical profile.

Read-only inspection confirmed that `%APPDATA%/Git Desktop`,
`%APPDATA%/Git Desktop-test`, `%APPDATA%/Git Desktop-dev`, and
`%APPDATA%/GitHub Desktop` exist as ordinary directories, with no junction/symlink
target. No profile link, copy, refresh, or rename was performed in this review.

The branding smoke tests deliberately supplied `--user-data-dir` pointing at
temporary QA profiles under the session visualization directory, with separate
Git configuration. Their fresh Welcome screenshots do not show the permanent
Test profile or indicate that its account/repository data was lost. Launching
the packaged Test executable normally selects its existing Test AppData profile.
The latest permanent Test profile log predates this session's isolated QA launch;
normal-profile startup was not repeated as part of this read-only review.

## Explicit Prod-to-Test profile refresh (2026-10-13)

The user subsequently reported missing configuration and explicitly requested
copying Prod into Test. Ran `script/refresh-test-profile.ps1` outside the sandbox
after confirming the resolved AppData root was
`C:/Users/vinni/AppData/Roaming`. Its process guard confirmed Desktop/Electron
apps were closed, and its link checks confirmed ordinary profile directories.

- Source: `%APPDATA%/Git Desktop` (81 files).
- Destination: `%APPDATA%/Git Desktop-test`.
- The original Test profile (82 files before replacement) is preserved at
  `%APPDATA%/Git Desktop-test.backup-20261013-111051-016`.
- Initial staging passed all 81 hashes, but independent post-replacement
  verification caught 145 files and a nested staging directory inside Test.
  The root profile had been recreated before installation; the actor responsible
  was not established. `Move-Item` can nest a directory into an existing target.
- Replaced the script's directory moves with `[IO.Directory]::Move`, which
  rejects an existing destination rather than nesting. Added verification of
  the installed profile's file count and hashes before reporting success.
- Repeated the refresh, preserving the intermediate nested state at
  `%APPDATA%/Git Desktop-test.backup-20261013-111236-965`.
- The corrected staged and installed copies passed all 81 hashes. A separate
  post-copy check also confirmed exactly 81 files and matching SHA256 hashes.
  PowerShell syntax and whitespace checks passed. An isolated directory-move
  fixture confirmed an existing target is rejected without nesting or modifying
  either source or destination.
- Production was only read. This is a one-time copy; the profiles remain
  independent. No permanent-profile app launch or authentication/repository
  operation was performed after the refresh. The cause of the reported missing
  configuration was not established by copying the profiles.

## Commit review (2026-10-13)

Reviewed the branding source, generated artwork, attribution, fork links, and
package metadata as one focused change. Reviewed the Test launcher, profile
diagnostics, and directory-refresh guard separately. No unrelated working-tree
edits or generated `out`/`dist` artifacts are included in the commit scopes.

26 focused menu, Welcome, tutorial, and sign-in tests passed. Formatting,
PowerShell syntax, whitespace, and scoped lint with the existing documented
rule exceptions passed. The previously blocked full profile regression also
passed during this review: both a fresh profile and a read-only Prod copy retained
Welcome completion and repository counts after X-close/reopen. Details and
verification boundaries are in `2026-10-13-test-profile-persistence.md`.
