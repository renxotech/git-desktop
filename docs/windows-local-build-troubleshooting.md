# Windows local dependency setup

Verified on 2026-10-01 in `D:\code\git-desktop`.

The checkout specifies Node 24.19.0 in `.node-version` and `.nvmrc`.
Node 25.0.0 fails the engine check for `ini@7.0.0`.

The original `node_modules` junction pointed to an unavailable
`D:\extcode\github-desktop\node_modules` target. It was preserved as
`node_modules.junction-backup-20261001`, and a normal local dependency
directory was created.

The subsequent native-package configuration failed with exit code 255 when
GYP invoked `node -p "require('node-addon-api').include_dir"`. The failure
was reproduced in a Python child shell outside the sandbox. The user's
Command Processor AutoRun setting invokes `D:\scripts\cmd\autorun.cmd`.
That script has an existing `_cmd_session_start` guard that skips startup
initialization in child shells. Setting that variable for the build process
resolved the failure. No registry or startup-script changes were made.

Dependency installation completed with exit code zero using:

```powershell
$env:PATH = 'C:\Users\vinni\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
$env:PYTHON = 'C:\Users\vinni\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$env:npm_config_devdir = Join-Path $env:TEMP 'git-desktop-node-gyp'
$env:_cmd_session_start = 'git-desktop-build'
node vendor/yarn-1.21.1.js install --frozen-lockfile
```

These environment assignments affect the current PowerShell session and its
children. Runtime cache paths may change in future installations.
The agent also required execution outside the sandbox for MSBuild to read
Windows SDK metadata. Optional packages for other platforms and peer
dependency warnings did not prevent the successful install.

Build command (close Git Desktop first):

```powershell
.\script\build-local.ps1 -NonInteractive -NoLaunch
```

Local evidence logs: `dependency-install.log` and `local-build.log`.

The production build and local packaging completed with exit code zero.
Output: `dist\GitDesktop-win32-x64\GitDesktop.exe`.
The app was not launched, and unit tests were not run as part of this
dependency recovery.

## Open in WSL distribution error (2026-10-13)

On this PC, Ubuntu is the default distribution and uses WSL2. Both the source
and production package already selected Ubuntu for Windows repository paths.
The failure across repositories was reproduced through the launcher's CMD
`start` command: `--distribution "Ubuntu"` produced
`Wsl/Service/WSL_E_DISTRO_NOT_FOUND`, while `--distribution Ubuntu` with the
same quoted `--cd` argument successfully printed `/mnt/d/code/git-desktop`.
The reproduction used `start /b /wait` and `--exec /bin/pwd` to collect output
without opening an interactive terminal.

The launcher now omits distribution-name quotes only for names consisting of
letters, digits, dots, underscores, and hyphens. Other names remain quoted to
preserve shell safety. Directory quoting and UNC owning-distribution selection
are unchanged. Eight focused launcher tests passed, including path punctuation
and the quoted fallback for a distribution name containing shell metacharacters.
The fallback is unit-tested only; no custom distribution was installed for it.

Direct Ubuntu execution and the corrected CMD command were verified on this
PC. An interactive click in the rebuilt application still requires verification.

Production webpack compilation passed. The first packaging attempt was blocked
by the running production application's file locks. Focused ESLint passed with
the unavailable `@typescript-eslint/no-empty-object-type` rule disabled for that
invocation; the normal invocation fails because the installed plugin lacks that
configured rule. No lint configuration was changed.

After the user closed Git Desktop, packaging succeeded outside the sandbox
(the sandbox attempt could not resolve GitHub for Electron). Production output:
`D:\code\git-desktop\dist\GitDesktop-win32-x64\GitDesktop.exe`.
The packaged renderer was inspected for the corrected argument selection.
