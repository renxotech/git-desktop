# Date-based local build review — 2026-11-10

Scope: adapt the local Windows/WSL build entry points using RealEasy's local
annotated-tag pattern. RealEasy backend/build.sh delegates to
D:/scripts/linux_env/platform-build; its ensure_release_tag creates annotated
local tags without pushing or moving existing tags. No shared backend scripts
were modified.

Implementation: build-local.ps1 allocates vYYYY.MM.DD_NN from local tags,
stamps the compiled About version, keeps compatible Electron/Windows versions,
and finalizes a checksum manifest and clean-source tag after packaging. The
WSL wrapper forwards --allow-dirty. Low-level npm build commands do not tag.

Findings and dispositions:
- Accepted/fixed: the requested label cannot be passed directly to the native
  executable version writer. It parses dotted integers; use year.month.day.counter.
- Accepted/fixed: reading source app/package.json in package-local discarded the
  generated package metadata. Read out/package.json after resource preparation.
- Accepted/fixed: the Package build type lacked a version property; declare it.
- Accepted/fixed: status letters alone cannot detect repeated edits to dirty
  files. Compare HEAD, porcelain status, tracked binary diff and untracked hashes.
- Informational: ignored dependencies and submodule contents are outside the
  source-change check. Documented; no submodule-policy changes in this task.
- Informational: optional tests execute after packaging/tagging under the existing
  builder flow. A build tag is not evidence of test acceptance; documented.

Validation: 18 disposable-Git checks pass on Windows PowerShell, covering first
counter, daily reset, increment, >99, native/SemVer versions, no tag at allocation
or missing output, annotated tag/manifest, collision rejection, dirty refusal and
preview/no tag, edits while building, untracked changes, changed HEAD and conflicts.
Initial restricted Git initialization failed on temp config permissions; normal
access passed. Initial synthetic index-conflict fixture was invalid; replaced
with a real divergent-branch merge and reran successfully. Fixtures removed.

Script TypeScript --noEmit --skipLibCheck, scoped Prettier, PowerShell parsing,
JavaScript parsing and scoped whitespace checks pass. Scoped lint auto-fix/check
passes with unavailable installed @typescript-eslint/no-empty-object-type and
pre-existing script/build.ts no-var-requires disabled. Repository-wide lint:fix
was scoped to preserve unrelated staged merge work. WSL listing was denied in
restricted execution, so WSL wrapper execution is unverified.

Limits: no full app build/launch or new tags in this checkout. About label wiring
is source/static validated; installed appearance and package acceptance remain
pending a subsequent build. Concurrent merge resolutions were left untouched.
Source snapshot: date-based-builds-20261110-source.txt. No commit or push.

Commit-time reconciliation: upstream merge completed separately at 50d49f69a4dc5c5c82beb83939ddd9136b4d1997.
All nine original source hashes matched. Updated the local Windows builder from
removed vendored Yarn to npm.cmd, preserving compile/resource/package/test order.
npm exec -- ts-node --version resolves the installed local tool; script TypeScript,
PowerShell parsing and whitespace checks pass. Reran all 18 disposable Git checks:
passed. No full packaging or app launch was performed. Commit includes only this
build-version scope; unrelated upstream automation report remains untracked.
