# Follow-up remediation

Implemented in the development checkout `D:\code\git-desktop` on
`desktop-improvements`, following the user's request to apply the fixes.
The October 12 follow-up review remains preserved as review evidence.

## Changes

- **S1:** Windows checkout paths open explicitly in Ubuntu. WSL UNC paths open
  in the distribution named by the path, with the corresponding native Linux
  path. Literal Windows path handling is retained. Ubuntu is registered on this
  PC. This supersedes the earlier launcher decision to require Debian-WSL1 for
  every path; no WSL default or distribution data was changed.
- **G1:** Explicit push refspec protection checks local sources. A remote
  destination sharing a protected local branch's name does not block a push
  from an ordinary branch. Remote deletions are allowed from ordinary branches;
  source wildcards block only if they match a protected branch. `--all` and
  `--mirror` remain blocked when rules exist. Pushes from a currently protected
  checkout remain blocked. Regression coverage reflects this policy change.
- **G3:** A pinned main checkout retains a visible `Main` description.
- **S7:** The Pull menu action becomes `Fetch and advance sandbox` on protected
  branches, retaining its shortcut and restoring the ordinary label elsewhere.
  Menu IPC updates account for label changes independently of enabledness.
- **S8:** Failed published-release lookups explain anonymous access and suggest
  signing in and retrying, or checking access/API availability for signed-in
  accounts. Release provenance is unchanged.
- **S9:** Sandbox settings, sandbox creation, and worktree repair dialogs use
  the existing readable error formatter.

S2's pending protection state, S3's conservative invalid-config protection,
S5's fetch routing, S6's uncached guard, and G2's path-based pin persistence
are retained, as discussed before implementation.

## Validation boundaries

All **29 focused tests passed**. ESLint, Prettier, `git diff --check`, and
`tsc --noEmit --skipLibCheck --pretty false` passed for the final changes.

Focused checks cover push-source and wildcard protection, remote deletions,
stale-fetch refusal, rule recovery UI, release lookup failures, WSL argument
construction, menu label updates/restoration, pinned-main presentation, and
existing menu/pin behavior. Disposable Git integration tests require execution
outside the restricted sandbox because object writes are denied there.

Production source compilation succeeded using Node 24.19.0. The bundle analyzer
reported an `import.meta` parsing warning for a vendor chunk; webpack compilation
completed successfully. TypeScript is checked with `--skipLibCheck`; this does
not establish a successful full dependency declaration check.

The initial full packaging attempt stopped because Git Desktop was running.
After the user closed it, the full local build and packaging completed using
Node 24.19.0. The executable is
`dist/GitDesktop-win32-x64/GitDesktop.exe`. SHA-256 comparisons confirm the
packaged `main.js`, `renderer.js`, and `renderer.css` match the compiled output.

The new executable was launched and Windows reported its main window, with the
process path verified against this checkout's packaged executable. It was left
running. This is a startup smoke check, not visual or interactive verification
of the changed controls. No WSL window launch, hot-reload check, live
release-provider validation, push, or deployment is claimed.
