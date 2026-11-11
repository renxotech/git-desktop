# Git executable selection

Implemented on `codex/select-installed-git`, based on `3939ad61e8`.

## Usage and behavior

Open **Preferences > Git > Executable**. Choose **Installed Git**, browse to an
executable or use **Find on PATH**, check compatibility, and save. Restart Git
Desktop to activate the selection. The active executable path and version appear
on this tab. The setting belongs to the application's current profile.

Existing profiles continue using bundled Git until the user selects installed
Git. **Bundled Git (fallback)** is an explicit choice in the same control. A
missing, invalid, or incompatible selection blocks Git operations and provides
recovery instructions; it never causes an automatic switch or mutation retry.
Preferences remains accessible when the selected installation is broken. Git
configuration edits are skipped when its configuration could not be loaded, so
the user can save the fallback selection and restart.

The executable is validated once for each renderer session. Saving preferences
does not change the executable for in-flight or subsequent operations in that
session. Restart activates and revalidates the saved selection. Updating files in
an installed Git distribution remains outside Desktop's control.

## Compatibility checks

The initial supported minimum is Git 2.46.0. This is a conservative support floor,
not a claim that every older release is unusable. Validation checks executable
access, version output, the helper directory and HTTPS transport helper, then
runs init, porcelain v2 status, NUL-delimited worktree listing, configuration
listing and hook invocation in a disposable repository. Probes have timeouts and
do not contact a remote. They exclude user configuration and templates from the
temporary-repository checks.

Git LFS availability is reported separately. Install LFS before using repositories
that require it. Local probes do not prove authentication, SSH, proxies, signing,
custom filters, enterprise configuration, or every command's behavior on every
supported Git release.

## Execution and integration

`app/src/lib/git/executable.ts` owns validated selection, environment construction,
buffered execution and streaming execution. It preserves dugite's output, stdin,
process callback, cancellation and `ExecError` contracts. Dugite still provides
error parsing and bundled environment construction.

All application imports of dugite's execution/resolution APIs have been routed
through this module: the central Git wrapper, streaming wrapper, credentials,
Git user-agent discovery, sandbox validation, hook discovery, and hook proxy.
A source-level regression test prevents direct execution/resolution imports from
being added elsewhere.

Installed Git uses its own helper directory, not the bundled distribution's
directory or templates. PATH prioritizes the chosen executable and its Windows
tools, including for nested Git calls from hooks and filters. Hook execution uses
the same selected executable even when its environment was loaded from a shell.
Arbitrary user hooks and shell configuration can still deliberately override
PATH or invoke another executable by absolute path.

The build also copies `git-credential-desktop` into the app-owned
`desktop-trampoline` directory. This directory is available to installed Git
through PATH, preserving Desktop's credential bridge without modifying the
installed Git distribution or directing it to bundled Git's helper directory.
The existing bundled helper copy remains available.

## Validation and review record — 2026-10-18

- 105 focused integration tests passed: executable selection, core execution,
  commits, diffs, worktrees, sandbox fast-forward rules and credential renewal.
- Four Preferences UI tests passed: complete picker paths, discovery and explicit
  fallback, compatibility errors, and recovery controls with missing active Git.
- The existing credential-renewal/HTTP-push test also passed in a separate test
  process with installed Git selected. Total distinct passing tests: 110.
- The executable-selection suite additionally exercises actual hook-proxy
  execution and nested Git resolution with both installations. It verifies local
  commit/fetch/push, binary output, stdin, process identity, cancellation, buffer
  limits, restart isolation, and missing/corrupt selections.
- Installed Git observed: 2.55.0.windows.5. Bundled Git observed:
  2.53.0.windows.4. Tests use disposable local repositories; no external Git
  server or user profile was changed.
- Windows sandbox restrictions prevented fixture `.git` renames and some Git
  launches through dependency junctions. The integration tests passed when run
  outside that sandbox. This was a test-environment restriction, not a fallback
  inside the application.
- Unrestricted TypeScript checking has an existing dependency error involving
  conflicting `WeakMap` declarations in `@types/lodash`; reproduced in the
  original checkout. Source checking with `--skipLibCheck` passes.
- Development renderer Webpack compilation passed. For this validation run,
  ts-loader's compiler options were overridden in memory with `skipLibCheck:
  true` and `rootDir: D:/code/git-desktop`. The former bypasses the existing
  dependency declaration conflict; the latter accommodates `windows-argv-parser`
  TypeScript sources reached through the shared dependency junction, outside the
  new worktree's root. The initial compile exposed that rootDir constraint.
  Repository compiler settings were not changed. This is source compilation,
  not a completed packaged build or installed application validation.
- The installed ESLint plugin lacks the configured
  `@typescript-eslint/no-empty-object-type` rule. Application and test files pass
  with that unavailable rule disabled on the command line. The build script
  additionally has a pre-existing `no-var-requires` violation at its existing
  package.json loading expression in `copyDependencies`. Repository lint configuration was
  not changed to suppress these baseline issues.

Review addressed recovery when Git cannot load configuration, selection changes
during operations, mixed Git helper environments, newer Git's rejection of
invented hook events, and credential-helper packaging for installed Git. Native
Desktop installation/restart and authentication against an external provider
still require packaged application validation.

The worktree reuses the original checkout's `node_modules` and `app/node_modules`
through junctions. Its source is based on the original committed HEAD; unrelated
uncommitted WSL changes in the original checkout were preserved there.

No commit, push, installation, or production/Test profile change was performed.
