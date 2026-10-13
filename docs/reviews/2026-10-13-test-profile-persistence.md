# Test profile restart investigation

## Report and scope

The user reported Welcome appearing after a Prod-to-Test profile copy and again
after reopening Test. Signing in exposed existing repositories; continuing
without signing in subsequently showed an empty application. The user launched
from the executable hyperlink in this chat. They requested one executable and
one reliable launch method, a restart fix, and another verified Prod-to-Test copy.

## Findings

- Two direct launches of the existing packaged Test executable resolved to
  `C:/Users/vinni/AppData/Roaming/Git Desktop-test` for both `userData` and the
  default browser session. The saved Welcome flag was `1`; the second read
  confirmed one stored account and 33 stored repositories. Welcome was absent.
- Read-only snapshots of Prod and Test were retained before both diagnostic
  launches under this session's `profile-defect/initial-*` evidence directories.
- These direct launches did not reproduce the user's hyperlink/restart failure.
  They used Playwright's normal app shutdown rather than clicking X, so they
  do not establish equivalence with the reported interaction.
- Earlier branding QA intentionally used temporary `--user-data-dir` profiles.
  Their Welcome screenshots were not observations of the permanent Test profile.
- No evidence establishes that Git icon changes erased browser storage. No
  Welcome flag was forced or reset, and no account/repository data was cleared.

## Changes

- Added `script/start-test.ps1`: validates the packaged Test product name and
  explicitly selects the permanent `%APPDATA%/Git Desktop-test` directory. The
  launch is independent of the caller's working directory and earlier QA launch
  arguments. It does not copy or reset data.
- The launcher clears `ELECTRON_RUN_AS_NODE` for its child and sets production
  mode, restoring its own process environment afterward. Optional QA arguments
  select isolated profiles and a loopback-only remote-debugging port; QA launches
  use a hidden window, and ordinary user launches expose no debugging port.
- Main-process startup logs now record app name, executable, user-data path, and
  browser session storage path. AppStore logs its Welcome decision. No account
  identities, tokens, or repository paths are added to these diagnostic messages.
- Added `script/test-profile-restart.mjs`, a Windows packaged-app regression
  runner using the launcher. Its fresh-profile case completes Welcome without
  login, adds a local fixture repository, closes through the title-bar X, and
  reopens the same profile. An optional copied-profile case checks account and
  repository counts across the same close/reopen sequence.

## Verification

- Test production compilation passed; packaging succeeded outside the sandbox
  after the sandbox's Electron download failed on DNS.
- The new Test package is under `dist/GitDesktop-Test-win32-x64` (3.6.7).
  Packaged `main.js` SHA256:
  `83C3DEFED0DDA5A9BC561E53E4A76939FBC4528F541BBA3903F13C4215BB349A`.
  Packaged `renderer.js` SHA256:
  `7D4CFD20F87BF1D2CF008A1C21326CEC9A412676509855881F828514F6858915`.
- 23 focused Welcome, sign-in-wrapper, and menu tests passed.
- Prettier, PowerShell parsing, and Git whitespace checks passed. Scoped ESLint
  passed with the already documented unavailable rule and existing
  `no-var-requires` warning disabled; project lint configuration was preserved.
- Production executable SHA256 remained
  `117DBA24CA53DC556C03419466C8995B0C129D24324E9CA84EB103A057727017`.

## Environment limitation during the initial investigation

The full elevated restart runner was not executed: automatic approval timed out
twice. A smaller isolated copied-profile launch and the final requested real
profile refresh were then rejected before execution because the approval review
model was at capacity. These are review-service failures, not unsafe-action
findings. A sandbox attempt failed creating the fixture's Git config because
the sandbox denied temporary `.git` writes; this is not app persistence evidence.

At that point the new launcher's full X-close/reopen regression and the newly
requested final profile refresh were not verified or completed. The user was
asked to run the existing refresh command locally or to retry after the review
service recovers. The reported failure's root cause remains unproven; the explicit
launcher is a mitigation and a reproducible entry point, not proof of a storage
engine defect fix. No commit or push was performed.

## Commit validation (2026-10-13)

The approval service recovered during the requested commit review. Confirmed no
Desktop/Electron apps were running and executed the full launcher regression:

```powershell
node script/test-profile-restart.mjs --source-profile 'C:\Users\vinni\AppData\Roaming\Git Desktop'
```

All four launches passed, using the actual `script/start-test.ps1` launcher and
closing through the title-bar X rather than substituting `app.quit()`:

| Case | Welcome flag | Stored accounts | Stored repositories |
| --- | --- | --- | --- |
| Fresh, after continuing without login and adding a fixture repo | `1` | 0 | 1 |
| Fresh, reopened | `1` | 0 | 1 |
| Read-only Prod copy, first launch | `1` | 1 | 33 |
| Read-only Prod copy, reopened | `1` | 1 | 33 |

Every launch verified the assigned profile path, an absent Welcome screen,
visible application toolbar, and no renderer errors. Evidence was retained at
`C:/Users/vinni/AppData/Local/Temp/git-desktop-profile-restart-MG4Rtu`.
The regression used temporary profiles and Git configuration; it did not refresh
or launch the permanent Prod/Test profiles. The user agreed to run the permanent
refresh locally, but its completion has not been confirmed in this chat.

26 focused menu, Welcome, tutorial, and sign-in tests passed during commit
validation. Formatting, PowerShell parsing, scoped lint with the documented
existing rule exceptions, and whitespace checks passed. Reviewed the launcher,
diagnostics, regression runner, and refresh guard as the profile-workflow commit
scope. The original hyperlink failure remains unproven; the explicit launch
method now has successful X-close/reopen evidence. No push is authorized.
