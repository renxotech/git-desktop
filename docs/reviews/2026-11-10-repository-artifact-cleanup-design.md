# Repository build artifact cleanup assessment — 2026-11-10

## Request, status and recommendation

User requests an assessment of repository-wide build/dependency cleanup across worktrees, adjustable retention defaulting to 24 hours, common-stack discovery and project-owned configuration. Assessment complete; this is a proposed design, not implementation authorization. No application changes or artifact deletion performed.

Recommend a repository context-menu action **Clean build artifacts…** with an on-demand preview and a declarative `.gitdesktop-cleanup.json` contract. Presets suggest paths; explicit project rules and the deletion service determine eligibility. Arbitrary project cleanup scripts are deferred because they defeat consistent preview, retention and path confinement.

## Existing source and integration assessment

- Inspected desktop-improvements at `5011348256fd99104d3615b68e7d066595e9e154`, with existing unrelated uncommitted smarter-cleanup changes. No source edits made by this assessment.
- `app/src/lib/git/worktree.ts` already enumerates Git-registered main/linked/detached worktrees with locked/unavailable information. Reuse enumeration, group by canonical Git common directory, deduplicate canonical paths. Separate clones and submodules are separate repositories.
- `app/src/ui/repositories-list/repository-list-item-context-menu.ts` is the natural entry point, with an optional worktree-menu shortcut selecting one checkout.
- `app/src/lib/git/worktree-branch-removal.ts` serves whole-worktree/branch removal and explicit ignored-file consent. Reuse design principles (preview/revalidation), not its branch-removal operation or a blanket ignored-file cleanup.
- `.gitignore` includes `.worktrees/` and `.envrc`: ignored status alone is not a generated-artifact contract. `package.json` already has `clean-slate`, but it deletes dependencies and reinstalls them without retention; do not execute it for this feature.
- This checkout's root and app node_modules are ordinary directories at inspection. Link/junction handling still requires explicit test coverage; no other checkouts scanned for artifact contents.

## Proposed interaction

1. Select repository → Clean build artifacts. Discover its registered worktrees, including paths outside the selected directory, and display every full path.
2. Default scope: all available worktrees. Offer selected worktrees/current worktree. Main/current checkout may be cleaned after review because it is preserved, unlike whole-worktree removal. Missing/locked roots are skipped with reasons.
3. Controls: **Keep artifacts changed within [24] [hours]**, accepting a nonnegative custom duration (0 means all eligible ages); Build outputs on; Dependencies and rebuildable caches separately selectable. Remember local preferences per common repository, not branch.
4. Preview by worktree and artifact unit: path, category, estimated bytes, age basis, eligibility or skip reason. Require a preview even for recognized projects. No automatic background deletion.
5. Clean selected items; report removed/skipped/failed paths and bytes actually removed where measurable. Cancellation stops between units. Partial failures stay visible; deletion is not an atomic transaction or guaranteed undo.
6. Unknown setup opens **Configure cleanup** with suggested project roots and a folder picker. No deletion for that project until rules are supplied. Known projects in the same repo may still proceed. Invalid/unsupported configuration produces actionable diagnostics.

## Retention semantics

Age must mean artifact change time, not branch commit time or presumed last use. Filesystem access times cannot reliably establish usage. An old dependency install can still be in daily use.

- Treat each dependency directory/cache/output directory as a whole unit by default. Never selectively delete old files inside node_modules or a build output set: that produces broken partial installations/builds.
- For independently named build generations, configuration can explicitly designate each immediate child directory as a separate unit. Do not apply that mode inside dependency installs.
- Generic fallback computes the newest available modification/metadata-change time over the unit and descendants, including directories, without following links. Directory mtime alone is insufficient. Packaged files can retain old mtimes, so metadata creation/change evidence must also be considered where reliable.
- Copy/preserve timestamp behavior and filesystem semantics differ. If age cannot be established confidently, show **Unknown age** and preserve it under time-based cleanup; do not silently qualify it. Future explicit build/install completion stamps can improve accuracy, but stale/missing stamps must not override newer filesystem evidence.
- A recently modified member preserves the entire unit. Equality with the cutoff is preserved. Time window is frozen for each reviewed preview; execution rechecks newer changes.
- Explain in UI that retention measures changes, not use; an old running application/build can still depend on eligible artifacts. Known busy roots are blocked. No cross-platform process check can prove inactivity, so users must stop builds/dev servers/editors that use the selected artifacts. Do not kill processes.
- Scan only on request with bounded concurrency, progress and cancellation; unknown/inaccessible subtrees block the affected unit. Large dependency trees may be expensive. Cached estimates are display hints and cannot authorize deletion.

## Declarative contract

Suggested versioned root file `.gitdesktop-cleanup.json`, with `version`, project roots, optional stack hints, explicit relative artifact paths, category, atomic-unit mode, protected paths and default keep hours. Technology is descriptive; configured artifact paths are authoritative inputs subject to safety enforcement.

Illustrative shape, not an implemented schema:

```json
{
  "version": 1,
  "keepHours": 24,
  "projects": [
    {
      "root": "web",
      "stack": "node",
      "artifacts": [
        { "path": "dist", "kind": "output", "unit": "directory" },
        { "path": "node_modules", "kind": "dependencies", "unit": "directory" }
      ]
    }
  ]
}
```

Validate each worktree independently: branches can differ in technology, layout or configuration, and monorepos can contain several stacks. Preview names the effective config for each root. A worktree's file takes precedence over suggestions; absent files allow local user-authored rules scoped to that canonical worktree. Provide explicit copying of reviewed rules across selected roots, not silent inheritance from another branch. Local retention/category overrides do not expand declared paths. Config changes invalidate the preview; loading repository JSON never executes code.

Start with explicit paths and bounded project discovery, avoiding unrestricted recursive globs. Missing declared outputs are normal. Preserve protection rules over include rules. Future templates or schema migrations need explicit versions.

## Proposed presets and boundaries

These are suggestions to review, not unconditional deletion rules.

| Stack | Detection suggestions | Candidate units and limits |
| --- | --- | --- |
| Node / React | package.json, framework/build-tool manifests | node_modules as dependencies; dist/build/out/framework caches only when confirmed/configured. React alone does not determine output structure. |
| Go | go.mod / go.work | Explicit project-local binaries/output directories. No universal bin/dist assumption; no global Go build/module cache cleanup. |
| Kotlin / KMP / Android | Gradle settings and build files, platform plugins | Declared per-project build outputs; custom directories supported. Project cache separate; preserve Gradle wrapper and user-wide Gradle caches. |
| Flutter | pubspec.yaml with Flutter dependency | build and .dart_tool candidates; account for custom build directory. Preserve SDK/global Pub cache. |
| Unity | ProjectSettings/ProjectVersion.txt and Assets | Declared player build outputs; Library/cache cleanup explicit and separately selectable, with editor closed. Preserve Assets, Packages and ProjectSettings. |

Primary references consulted: [Flutter CLI](https://docs.flutter.dev/reference/flutter-cli) describes build/.dart_tool cleanup and configurable build directory; [Gradle directories](https://docs.gradle.org/current/userguide/gradle_directories.html) distinguishes project build outputs from Gradle User Home; [Go command](https://go.dev/cmd/go/?m=old) and [modules reference](https://go.dev/ref/mod) describe cache scope; [Unity directories](https://docs.unity.com/en-us/engine/6000.7/manual/get-started/project-configuration/default-directories) describes generated Library data; [Unity issue tracker](https://issuetracker.unity.com/issues/21836/library-folder-of-the-opened-project-can-be-deleted-which-leads-to-the-crash) documents the risk of deleting Library while a project is open.

## Deletion service constraints and review findings

Enforce these in the filesystem/Git service, independently of UI disabled controls. No remote backend is needed for this local desktop capability.

| ID | Finding / disposition | Priority and next action |
| --- | --- | --- |
| A1 | Existing worktree deletion is the wrong operation; accepted design requirement | P1 future implementer: dedicated preview/execution service preserving branches/worktrees/stashes. |
| A2 | Ignore status is not artifact identity; accepted design requirement | P1: require reviewed declared targets, reject tracked content (including staged additions), protect Git metadata/source/configuration and nested repositories/submodules/worktrees. For v1 require ignored targets too; show unignored candidates as blocked until ignore rules are deliberately added. Never use unrestricted git clean. |
| A3 | Age does not establish inactivity; accepted design requirement | P1: unit retention, unknown-age preservation, full-tree checks, busy-item skips and honest UI terminology. |
| A4 | Same-repository worktrees can differ; accepted design requirement | P1: per-worktree config resolution, mixed-stack project roots and explicit paths. |
| A5 | Links/shared caches can escape intended scope; accepted design requirement | P1: reject absolute/traversal/root targets, verify canonical containment and Git identity, reject link/reparse-point targets and ancestors, never traverse internal links, skip units with unresolved link boundaries in v1. Exclude global caches; deduplicate overlapping targets and report protected descendants. |
| A6 | Preview can become stale and deletion can be partial; accepted design requirement | P1: snapshot config/root/target identity and eligibility, revalidate before each unit, reject new tracked/protected paths or changed units, safe no-follow traversal and explicit partial-failure results. Rechecks alone do not make concurrent writers safe; no claim of atomicity. |
| A7 | Project scripts can exceed preview/retention scope; deferred extension | P2: exclude arbitrary commands in first release. Later integration would need an explicit trust and plan/execute contract; ordinary clean tasks are insufficient. |
| A8 | Million-file scans affect responsiveness; accepted design requirement | P2: lazy bounded scanning, cancellation and size estimates; performance acceptance on representative dependency trees. |

All accepted items are proposed implementation backlog, not authorization to implement. No discovered production defect is being silently deferred by this design task. Existing smarter-worktree-removal changes remain owned by their separate task.

## Finite implementation proposal and acceptance

1. Core chunk: config/schema, per-worktree discovery, dry-run preview, retention, confined executor and repository dialog. Explicit custom rules make unknown stacks usable immediately.
2. Preset chunk: manifest-based suggestions for the named stacks, multi-project setup and configuration generation. Do not parse build files by executing them.

Required validation if implemented: disposable repositories spanning main/linked/detached/external-path worktrees; mixed layouts; tracked/ignored/untracked protection; whole-unit age boundaries and preserved old package mtimes; config drift; nested repos; links/junctions; active/locked files; cancellation and partial errors. Exercise Windows first, then validate supported other platforms before claiming portability. Verify preview/execution agreement and no changes to source, branches or stashes. Large-tree performance and packaged UI acceptance are separate from unit tests.

Assessment limits: targeted source inspection and official documentation research only. No benchmark, live cleanup, app build, tests, commit or push. Next action requires user direction on implementation; the recommendation is declarative configuration with presets, 24-hour default and separately selectable dependency/cache removal.

## Implementation and validation — 2026-11-10

- User authorized implementation. Dedicated service `app/src/lib/artifact-cleanup.ts`, dialog `app/src/ui/repositories-list/artifact-cleanup-dialog.tsx`, repository context action and Popup integration implemented. Usage/schema: [artifact cleanup](../artifact-cleanup.md).
- Source review: service revalidates candidates and project config before scoped literal `git clean -fdX`; protects tracked/staged paths, links/junctions, nested regular/bare repos, protected names and configuration. Units are whole directories; retention uses newest member filesystem metadata. No unresolved actionable findings found in this source assessment. No arbitrary scripts run.
- Schema refinement: v1 uses a flat artifacts array with worktree-relative prefixed paths for monorepos instead of nested project records. This provides the same explicit per-project path scope with fewer schema fields. Per-worktree root JSON takes precedence over suggestions. Session edits are explicit overrides; no project files are written by the dialog.
- Preset scope: Node/React, Gradle/Kotlin/KMP, Flutter and Unity local caches suggested through bounded discovery. Go outputs and Unity custom player builds require explicit paths. Unknown setups receive editable configuration and actionable preview errors. Dependencies/caches default off. Unit selection is through worktree/rule/category selection before preview; eligible reviewed units are then removed together.
- Deliberate v1 limits: no automatic config saving/folder picker, remembered local preferences, per-generation child-unit mode or build-completion stamps. These are optional follow-up enhancements; explicit JSON paths/session controls cover custom layouts and retention now. Script integration remains deferred A7. Full-tree scan is bounded in concurrency (serial), but no million-file performance benchmark performed (A8 performance acceptance remains pending).
- Final focused validation: 12/12 tests pass, covering disposable real-Git cleanup, whole-unit retention, stale folder/config rejection, tracked/staged protection, nested repositories, cancellation, category filtering, config/preset loading, actual main+linked worktree cleanup, junction preservation, and dialog preview gate. Initial restricted fixture writes failed; normal local test access succeeded. Subsequent test fixes corrected cleanup-hook ordering and native-dialog DOM querying; production expectations unchanged.
- TypeScript noEmit/skipLibCheck, focused ESLint (only unavailable installed no-empty-object-type rule disabled) and Prettier pass. Windows source/local validation only; no packaged manual acceptance, cross-platform runtime validation or large-tree benchmark. Existing React test-harness warnings are non-failing.
- Source findings A1–A6 implemented with the constraints above; A8 lazy/serial scanning and cancellation implemented, performance validation pending; A7 scripts deliberately deferred. No actual user artifact deletion, commit/push or production package performed. Exact source hashes are in `artifact-cleanup-20261110-source.txt` alongside this report.
