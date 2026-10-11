# Sandbox rules review and remediation

Reviewed and repaired on 2026-10-11 in `D:\code\git-desktop`.

The current source confirmed all five correctness findings from the independent
2026-10-01 review. The user authorized fixing those findings before committing.
Worktree aliases and the Debian-WSL1 launcher were also reviewed.

## Changes

- **R1: stale branch targets after a failed fetch.** Branch rules now fetch their
  exact source into isolated tracking refs using a throwing Git call before
  resolving the target commit. A handled failure in the ordinary GitStore fetch
  pipeline cannot substitute a stale remote-tracking ref. Each rule obtains its
  own fresh source evidence, allowing other eligible rules to proceed. Source
  target fetches defer submodule recursion to checkout completion.
- **R2: filenames and push refspecs.** Protection inspects branch/worktree target
  commands instead of matching every argument. Ordinary filenames and commit
  messages can match a protected branch name. Push checks distinguish the remote
  operand and cover source/destination refs, force prefixes, deletion refspecs,
  and broad all/mirror/wildcard pushes.
- **R3: invalid configuration recovery.** Worktrees remain visible when parsing
  fails. Settings expose the invalid value and an explicit action to back up and
  reset all repository rules. Reset refuses a stale value, stores a backup in
  `desktop.sandboxRulesBackup`, and disables rules in the shared local config.
  Mutation guards continue to reject invalid configuration until reset.
- **R4: commit keyboard listener lifecycle.** The listener is installed before
  awaiting protection lookup and removed on unmount. A pending mount continuation
  cannot reinstall it. Pending protection and lookup errors have distinct text.
- **R5: submodule completion retry.** Failed completion retains the initialized
  submodule HEADs in rule metadata. Subsequent Fetch verifies superproject HEAD,
  operation markers, submodule cleanliness, and recorded/expected submodule HEADs
  before retrying. Intervening local edits or commits block completion. Current
  superprojects also initialize missing submodules instead of skipping completion.

Aliases persist independently by normalized worktree path, transfer after a
successful worktree move, and clear after removal. WSL opens the selected path
in Debian-WSL1 and rejects another distribution's UNC filesystem path.

## Validation

- **73 tests passed** across the rule configuration, stale-fetch/refspec
  regressions, real Git integration, release API, settings/commit UI, aliases,
  WSL argument construction, and adjacent worktree behavior.
- **16 additional existing fetch/GitStore tests passed.**
- ESLint and Prettier pass for the changed application/test files.
- `tsc --noEmit --skipLibCheck --pretty false` passes. The full declaration check
  remains blocked by the installed TypeScript/lodash `WeakMap` conflict.
- `git diff --check` passes.

Real Git tests use disposable local repositories. The recovery test makes a
submodule source unavailable, confirms partial completion, verifies preservation
of intervening edits and commits, then restores the source and completes Fetch.
The restricted initial run encountered Git object-write permissions; the final
Git integration runs used approved execution outside the sandbox.

The earlier review documents and reproduction source are historical evidence.
The old reproduction intentionally asserts the faulty behavior and is expected
to fail against the repaired implementation; current regression assertions live
in `app/test/unit/sandbox-rule-regression-test.ts`.

No packaged build, running-app visual/accessibility verification, actual WSL
window launch, live authenticated release-provider verification, push, or
deployment is claimed. App-level checks do not lock out external Git processes
or editors. Filesystem races remain bounded by Git's own safety checks.
