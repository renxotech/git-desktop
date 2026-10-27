# Local Prod, Test and Dev builds

## Version numbers

Git Desktop has its own semantic version in `app/package.json` (`version`),
starting at 1.0.0. Increment that version for fork releases: patch for fixes,
minor for compatible features, major for breaking changes. This is the version
shown in About and used for packaged application metadata.

The separate `upstreamVersion` field records the GitHub Desktop release on
which this fork is based (currently 3.6.10). About displays it as
“Based on GitHub Desktop v3.6.10”. When integrating upstream, retain the fork's
version and update `upstreamVersion` to the integrated upstream release.
Fork release notes continue to link to this project's releases.

Version separation verified on 2026-10-28: production compilation and Windows
x64 packaging passed. The package in `dist/prod-1.0.0/GitDesktop-win32-x64`
contains version 1.0.0 and upstreamVersion 3.6.10; the executable's product and
file versions are both 1.0.0. The compiled renderer includes the versioned
upstream credit. Source review confirmed application version consumers still
use the fork's `version` and release notes still target the fork's releases.
Formatting and whitespace checks passed. The packaged About dialog has not
been checked interactively; no automated tests were added for this display
and metadata change. The alternate output avoids the locked standard Prod
directory observed during the preceding build.

Commit review on 2026-10-28 found no actionable defects in the version
metadata, shared branding export, About rendering, or accompanying records.
Prettier and focused ESLint passed; the lint command disabled only the
unavailable installed rule `@typescript-eslint/no-empty-object-type`, as in
the earlier feature validation. Prior production compilation and packaging
receipts above remain applicable; no production code changed after that
build. Submodule contents were not reviewed because their Git metadata is
inaccessible in the restricted environment. Interactive About acceptance
remains unverified.

The main checkout at `D:\code\git-desktop` uses branch `desktop-improvements`.
Dev remains in `.worktrees/dev` on branch `dev`. Test uses the main checkout's
current source, including any uncommitted changes, and has no separate branch.

| Target | Build | Launch | Distribution | Permanent profile |
| --- | --- | --- | --- | --- |
| Prod | `yarn build:prod` | `yarn start:prod` | `dist/GitDesktop-win32-x64` | `%APPDATA%/Git Desktop` |
| Test | `yarn build:test` | `yarn start:test` | `dist/GitDesktop-Test-win32-x64` | `%APPDATA%/Git Desktop-test` |
| Dev | `yarn build:dev` | `yarn start` | Dev worktree output | `%APPDATA%/Git Desktop-dev` |

Builds replace only their own distribution. Prod can remain running while Test
is built and launched. Compilation uses a shared `out` directory, so run builds
sequentially. Rebuilding does not reset profiles. Test has a separate packaged
name and bundle identity and does not register itself as the default protocol
handler over Prod.

To refresh Test's settings and repository list from Prod, close Desktop apps
and run `yarn profile:refresh-test` on Windows. The command stages the copy,
verifies every file by SHA256, backs up the old Test profile, then replaces it.
Production is read only. Backups remain beside the profiles. On failure before
replacement the current Test profile remains intact; a failed final move restores
the backup. Profiles evolve independently between explicit refreshes.

To restore a backup, close the apps, preserve the current Test folder under a
different name, then rename the chosen backup to `Git Desktop-test`.

## Manual Test launch

For manual Test launches, use the explicit profile launcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\code\git-desktop\script\start-test.ps1
```

It validates the packaged Test identity and passes the permanent
`%APPDATA%\Git Desktop-test` profile explicitly to the Test executable. It does
not refresh or reset the profile. `-UserDataDirectory` and
`-RemoteDebuggingPort` are optional arguments for isolated restart regression
checks; normal launches need neither.

## Implementation verification (2026-10-13)

- Removed the clean `.worktrees/test` checkout and fully merged local `test`
  branch after verifying it had no unique commits. The `dev` checkout remains.
- Script TypeScript compilation, formatting, and whitespace checks passed.
- Prod/Test name and distribution selection assertions passed.
- A temporary profile fixture verified copy hashes, preservation of the previous
  Test profile, and refusal to refresh while a Desktop process is running.
- Production compilation and Test packaging completed. Packaging required an
  unrestricted retry because sandbox DNS prevented the Electron download.
- Both packaged executables remained running simultaneously. Test's profile log
  reported the copied account and 33 repositories. The existing Prod executable
  retained its pre-build modification time.
- Test startup logged an early Git lookup failure while reading sandbox
  protection, plus notification shortcut fallback messages. The packaged Git
  executable passed `--version`. Repository operations and notification delivery
  were not fully validated by this profile/build change.
- No additional real profile refresh was performed; the previously copied Test
  profile was retained.

## Commit review (2026-10-13)

- Reviewed all eight changed files together as one local Prod/Test build feature.
- Rechecked script TypeScript compilation with `--noEmit`, formatting for the six
  TypeScript/JSON files, PowerShell syntax, and Git whitespace checks; all passed.
- Rechecked Prod/Test product names, bundle identities, Windows executable names,
  distribution paths, and the compiled Test app-name replacement; all passed.
- The packaging, profile fixture, and simultaneous-launch observations above
  are prior implementation evidence; they were not repeated for this commit.
- Parent repository inspection used `--ignore-submodules=all` because the
  existing choosealicense.com submodule metadata was inaccessible in the sandbox.
  Submodule contents were not reviewed. No real profile was refreshed during
  this review, and no build or app launch was performed.
