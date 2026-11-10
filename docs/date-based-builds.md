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
`dist/GitDesktop-win32-x64/GitDesktop.exe`, including the label, source commit,
dirty flag and executable SHA256, and creates a local annotated tag on the
source commit. Existing tags are never moved; concurrent tag collisions fail.
Tags are not pushed. Build failures do not create tags. `-Tests` runs the
optional unit suite after packaging/tagging, so a test failure can leave an
existing build tag; the tag records packaging, not test acceptance.

Uncommitted changes require `build.cmd -AllowDirty` (WSL: `--allow-dirty`).
These previews show `v2026.11.10_01-dirty` and never create a release tag.
Unresolved conflicts are always rejected. The builder rejects changes to HEAD,
tracked diffs or untracked files detected during packaging. Ignored files and
submodule contents are outside this source-state check; dependencies and static
assets must be prepared before building. Avoid editing source during a build.
`-LaunchOnly` reopens the existing executable without allocating a version.

Validate version/tag behavior without compiling the app:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File script/build-version-test.ps1
```

The validation uses a disposable local repository and does not modify this
checkout's tags or index.
