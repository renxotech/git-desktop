# TypeScript 7 build failure after merging

Date: 2026-11-15. Source: `desktop-improvements` at `cf946a46e0c7010b284b92ac1292f7874283db64`. Execution owner: `/root/fix_merged_build`; independent QA: `/root/review_ts7_build`; coordinator: `/root`.

## Finding and disposition

**TS7-MERGED-DEPS — accepted and repaired environment mismatch.** The merge brought the new dependency declarations and build scripts into this checkout, but its installed dependencies still belonged to the previous graph. Root TypeScript was 6.0.3; `@typescript/native` and esbuild-loader were absent. Installed trampoline and argv packages also retained their old compiler scripts. Dependencies installed in the successful isolated TS7 worktree were independent of this checkout.

The supplied log first shows the notification guard finding no installed `script/compile-typescript.cjs`. The notification repair then copied the current vendor sources and successfully compiled its native C++ component. Its compiler resolver could not find the root native compiler alias, fell back to the old TypeScript package, and correctly rejected a version other than 7.0.2. That repair refreshes only notifications; it cannot install the new root dependency graph.

The existing source declarations and explicit compiler guard are correct. No production-code change, compiler downgrade or weakened check was needed. This finding is resolved by refreshing this checkout's frozen dependencies and required lifecycle outputs.

## Repair and preservation

- Root and app frozen installs passed with scripts suppressed: 1,228 and 330 packages. Normal root postinstall recursively updates submodules, so it was avoided to preserve the existing dirty gitignore submodule.
- Required dependency lifecycle scripts ran explicitly for electron-winstaller, printenvz, process-proxy, both esbuild installations, desktop-notifications, desktop-trampoline, windows-argv-parser, fs-admin, keytar, registry-js and dugite. Electron installation followed. Every step exited successfully; npm approval policy and repository configuration were unchanged.
- The actual native compiler executable reports 7.0.2, the compatibility package is `@typescript/typescript6` 6.0.2, and esbuild-loader is 4.5.0. All three installed vendor compiler scripts match the source, and notification source/artifact receipt verification passes.
- Before setup, full-access inspection found no active build/install, Git operation or cooperative sync owner. Root/app dependency directories were ordinary owning directories. The original main HEAD, six manifest/build-wrapper hashes, empty source/index diffs and dirty gitignore HEAD/status were preserved through setup. Restricted metadata/CIM access failed; normal-access inspection succeeded.

Evidence is retained locally under `tmp/merged-ts7-build-20261115/`: preflight/source manifests, submodule snapshots, frozen-install logs, the exact lifecycle recipe, lifecycle output and handoff patches/status. Installed dependencies and these local logs are not part of the requested documentation commit.

## Recovery in this checkout

Run dependency preparation separately in each owning worktree after dependency manifests or local vendor sources change. A Git merge does not copy another worktree's installed dependencies. Close active builds first and do not run this against shared dependency junctions.

For this source graph, the following PowerShell recipe uses committed lockfiles, preserves local submodule state and runs only the required dependency lifecycle steps. Stop on a failure; do not change package versions to bypass the error.

```powershell
$ErrorActionPreference = 'Stop'
function Invoke-SetupNpm {
    & npm.cmd @args
    if ($LASTEXITCODE -ne 0) { throw 'Dependency preparation failed.' }
}
Invoke-SetupNpm ci --ignore-scripts --no-audit --no-fund
Invoke-SetupNpm --prefix app ci --ignore-scripts --no-audit --no-fund
foreach ($taskPackage in @('electron-winstaller', 'printenvz', 'process-proxy')) {
    Invoke-SetupNpm --prefix "node_modules/$taskPackage" run install
}
foreach ($taskPackage in @('esbuild', 'esbuild-loader/node_modules/esbuild')) {
    Invoke-SetupNpm --prefix "node_modules/$taskPackage" run postinstall
}
foreach ($taskPackage in @('desktop-notifications', 'desktop-trampoline', 'windows-argv-parser', 'fs-admin', 'keytar', 'registry-js')) {
    Invoke-SetupNpm --prefix "app/node_modules/$taskPackage" run install
}
Invoke-SetupNpm --prefix app/node_modules/dugite run postinstall
& node node_modules/electron/install.js
if ($LASTEXITCODE -ne 0) { throw 'Electron installation failed.' }
& node script/notification-dependency.cjs
if ($LASTEXITCODE -ne 0) { throw 'Notification verification failed.' }
```

The explicit lifecycle list reflects this reviewed dependency graph. Reassess it if future lockfile changes introduce other required install scripts. Do not run the normal root postinstall merely to repeat these steps when it would mutate a dirty submodule.

## Independent validation and concurrent work

Initial independent prechecks passed for all 1,535 frozen tracked source/configuration hashes, the actual native compiler, compatibility API, loader, all three vendor compiler scripts and the notification receipt. Before compilation, unrelated concurrent AI work changed source files and added `app/src/lib/ai/`. QA detected this drift and stopped. Those edits were preserved; this task neither corrected nor accepted their behavior.

QA instead archived the complete exact merged commit into an ignored synthetic source directory with temporary links to the repaired root/app dependencies. `CIRCLE_SHA1` supplied the exact commit identity because the archive contains no Git metadata; no product source patch was made. Independent validation passed: native compilation of all nine scopes and production compilation of all five webpack configurations, exit 0. The three known Copilot SDK createRequire warnings remain informational. All 1,535 archived source hashes still match after compilation; QA removed both owned dependency links and retained the archive and logs. An initial archive run failed because Git metadata was absent; using the existing CIRCLE_SHA1 override resolved snapshot setup without a source change.

Final evidence: `tmp/merged-ts7-build-20261115/independent-synthetic-qa-receipt.json`, `independent-synthetic-native.log` and `independent-synthetic-compile-prod.log`. The receipt identifies the full tested commit, source manifest and successful checks. Earlier setup/harness failures are retained separately and are not counted as passing checks.

The local environment is Node 24.21.0/npm 12.2.0; `.nvmrc` recommends 24.22.1, and the supplied earlier attempt used Node 26.12.1. Results describe the environment actually used. Validation of the exact archived merge does not validate later concurrent AI edits or a future build of changing main source.

No packaging, app launch, frontend/UI/manual tests, remote administration, main push or user-process termination was performed. The requested commit contains this report only; the dependency repair remains local to this checkout.
