# Build and run the notification correction

Use the isolated worktree, not the main checkout. Source is on
`codex/notification-initialization`, tracking `origin/desktop-improvements`.
No package build or launch has been performed for this corrected source; the
user owns the build/run and original-state trace.

The earlier user-built v2026.11.11_03-dirty package exposed a trace-helper
startup bug: Electron makes `process.traceDeprecation` read-only in that launch
configuration. The helper no longer assigns it; warning stacks are still saved
and `--trace-deprecation` remains the launch option. Close the old error dialog
and exit that app before rebuilding/running. The new output below preserves the
earlier package and avoids its executable locks.

## Build

Open PowerShell and run:

```powershell
Set-Location 'D:\code\git-desktop\.worktrees\notification-initialization'
.\build.cmd -AllowDirty -NoLaunch -NonInteractive -OutputDirectory dist/notification-init-tracefix-20261111
```

This builds an untagged dirty preview, leaves other packages intact and does not
launch the app. A successful build creates:

`D:\code\git-desktop\.worktrees\notification-initialization\dist\notification-init-tracefix-20261111\GitDesktop-win32-x64\GitDesktop.exe`

The normal local builder uses an 8 GB compiler allowance. Leave the worktree's
source and review/evidence files unchanged while building; its existing build
fingerprint gate checks the exact source state. Build-info records the dirty
preview label, base commit and executable hash.

## Launch with trace and logs

Quit existing Git Desktop instances through the application first so another
instance does not receive the launch. The commands below open the normal user
profile; ordinary background repository checks may run. They do not explicitly
fetch, change repositories or configure notifications.

```powershell
$env:DESKTOP_TRACE_DEPRECATIONS = 'true'
$env:DESKTOP_DEPRECATION_TRACE_FILE = 'D:\code\git-desktop\.worktrees\notification-initialization\dist\notification-init-tracefix-20261111\deprecation-trace.jsonl'
& 'D:\code\git-desktop\.worktrees\notification-initialization\dist\notification-init-tracefix-20261111\GitDesktop-win32-x64\GitDesktop.exe' --trace-deprecation --enable-logging=file --log-file='D:\code\git-desktop\.worktrees\notification-initialization\dist\notification-init-tracefix-20261111\electron.log'
```

The explicit trace flag accepts only trimmed, case-insensitive `true`; unset,
null/empty/false and other values leave tracing off. The shared hook installs
before other app imports in both main and renderer processes. It appends
`trace-started` records and DEP0169 warning stacks to the JSONL file. Warnings
remain visible and URL parsing is unchanged. The file does not intentionally
record URL arguments, account data or tokens.

Send `deprecation-trace.jsonl`, `electron.log`, `GitDesktop-win32-x64/build-info.json`
and any console output, plus what action preceded a warning. A trace with only
start markers means the warning did not occur during that run. Console output
alone can be empty for this Windows GUI app, which is why the file hook exists.
App logs can also be opened through Help → Show Logs in Explorer. An unregistered
portable build now records an informational "Windows notifications unavailable"
message rather than trying a guessed identity; working installed toast delivery
still requires a correctly registered fork shortcut.

After launching, remove these variables from this PowerShell session if desired:

```powershell
Remove-Item Env:DESKTOP_TRACE_DEPRECATIONS, Env:DESKTOP_DEPRECATION_TRACE_FILE
```

## Prepared local dependencies and rebuilding them

The current worktree is ready for the build command above:

- `node_modules` links to installed build dependencies in the main checkout.
- `app/node_modules` has per-package read-only links to installed dependencies,
  except `desktop-notifications`, which links to this worktree's edited
  `vendor/desktop-notifications`. This local package's TypeScript output and
  native addon have already been compiled and linked successfully, and its
  before/failed-initialization backend contracts were independently checked.
- Emoji, license and Git ignore template submodule directories link read-only
  to existing assets in the main checkout. No upstream assets were changed.
- Build outputs remain independent under this worktree's `out` and chosen dist.

Do not reinstall packages through the shared dependency links. If preparing a
fresh independent dependency installation later, rebuild/install from this
branch's vendor source and verify the application resolves that edited package,
not the old installed copy. Current resolution can be checked with:

```powershell
node -e "console.log(require.resolve('desktop-notifications',{paths:[process.cwd()+'/app']}))"
```

It must point to this worktree's `vendor/desktop-notifications/dist/index.js`.
For a future native rebuild with the currently installed Electron 44.1.1 headers,
the standard command is below; cached headers/import libraries exist locally.
This is not needed for the current prepared addon.

```powershell
$env:NODE_PATH = "$PWD\app\node_modules"
node .\node_modules\node-gyp\bin\node-gyp.js rebuild --directory vendor/desktop-notifications --target=44.1.1 --dist-url=https://electronjs.org/headers --napi_build_version=4
node .\node_modules\typescript\bin\tsc -p vendor/desktop-notifications/tsconfig.json
```

The already prepared addon was compiled against installed Node 24 headers with
N-API v4, then independently loaded in Node 24 for failure/retry/default/teardown
checks. Electron runtime native success and installed toast/Action Center
delivery remain unverified; user build/run acceptance is a separate step.

Source snapshot and review results:
[notification initialization receipt](reviews/2026-11-11-notification-initialization-fix.md).
