# Date-based local builds

Run `build.cmd -NoLaunch` on Windows, or
`bash script/build-local.sh --no-launch` from Ubuntu WSL. These local build
entry points create versions such as `v2026.11.10_01`. Low-level npm
compile/build commands remain available without automatic tagging.

The date uses the Windows machine's local calendar. The counter starts at 01
each day and increments above the highest matching local tag across all
branches. It grows to 100 after 99. Tags are not fetched automatically; fetch
the team's tags before building if you need a shared sequence across machines.

A clean build displays the exact label in About. Electron's package version
uses `2026.11.10-build.1`, and Windows executable versions use
`2026.11.10.1`. Source package files are not rewritten or committed.

After packaging succeeds, the builder writes `build-info.json` beside
`dist/<version>/GitDesktop-win32-x64/GitDesktop.exe`, including the label, source commit,
dirty flag and executable SHA256, and creates a local annotated tag on the
source commit. Existing tags are never moved; concurrent tag collisions fail.
Tags are not pushed. Build failures do not create tags. `-Tests` runs the
optional unit suite after packaging/tagging, so a test failure can leave an
existing build tag; the tag records packaging, not test acceptance.

Uncommitted changes to build inputs require `build.cmd -AllowDirty` (WSL: `--allow-dirty`).
These previews show `v2026.11.10_01-dirty` and never create a release tag.
Unresolved conflicts are always rejected. The builder rejects changes to HEAD,
tracked diffs or untracked build inputs detected during packaging. Ignored files and
submodule contents are outside this source-state check; dependencies and static
assets must be prepared before building. Avoid editing source during a build.
Default output folders use the generated label, for example
`dist/v2026.11.11_01/GitDesktop-win32-x64/GitDesktop.exe` (or a `-dirty` label).
An older running build can stay open while a new version builds. A running app
using the selected output must be closed before that output can be replaced.
`-OutputDirectory dist/my-preview` retains an explicit output override.

After packaging and version finalization succeed, default outputs receive a
`.desktop-build-output.json` ownership receipt. The builder then attempts to
remove strictly older version folders with matching ownership and build receipts
from this checkout's `dist`. Current/equal/newer versions, legacy folders,
explicit outputs and unmarked folders are preserved. Linked folders or contents
are preserved. Locked files or other cleanup failures warn and leave the new
build successful. Explicitly reusing a formerly automatic folder removes its
cleanup ownership receipt. Existing custom output folders are not migrated or
deleted automatically.
Rebuilding an owned output revokes its completion marker before compilation;
the marker returns only after successful version finalization. A failed rebuild
is therefore excluded from automatic launch selection and cleanup.
If the default version path already exists without a completed ownership receipt
(including an interrupted build), the builder stops rather than replacing it.
Preserve that folder and choose an explicit output override to continue.

`-LaunchOnly` and `launch-github-desktop.cmd` select the highest completed default
version (latest build time breaks equal-version ties), with the legacy
`dist/GitDesktop-win32-x64/GitDesktop.exe` as a fallback. Use
`-LaunchOnly -OutputDirectory dist/my-preview` to select a custom output.
Launch-only runs do not allocate versions or clean older outputs.

Validate version/tag behavior without compiling the app:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File script/build-version-test.ps1
```

The validation uses a disposable local repository and does not modify this
checkout's tags or index.

Documentation-only edits do not block a tagged build or mark its source dirty.
This exclusion is limited to Markdown files under `docs/`, plus the exact prose
paths `AGENTS.md`, `README.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`,
`SECURITY.md`, `Codex-ToDo.md`, `TODO.md`, `.github/CONTRIBUTING.md`, and
`.github/copilot-instructions.md`. They are excluded consistently from the
initial dirty gate and the final source-state fingerprint. Markdown elsewhere,
non-Markdown files under `docs/`, source, assets, dependencies, configuration
and build tooling still count as build inputs. Staged, unstaged and untracked
changes count; moves check both the old and new paths. Conflicts in any path
still block builds. This rule applies only to local build identity; upstream
sync continues to require an entirely clean checkout, including documentation.