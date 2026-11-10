# Configured editor menus — 6 November 2026

Request: replace the explicit Visual Studio Code folder action with configured editors and their friendly names.

## Implementation and assessment

- Preferences > Integrations retains the existing default-editor selection (detected or custom), adds a friendly-name field for the custom default, and adds optional detected/custom editor entries with removal controls.
- Additional custom editors have a friendly name, executable picker and arguments. Settings use the existing preference Save/Cancel lifecycle and local-storage persistence. Old profiles default to an empty additional-editor list; existing default-editor settings remain compatible.
- Repository, branch and worktree folder actions show the default first and then additional editors. Detected-editor duplicates are suppressed. Each action passes the exact checkout path and selected detected/custom launch configuration through the existing dispatcher/launcher. Additional editors do not change the default.
- Default-editor labels in the application menu and file/conflict surfaces use the custom friendly name where applicable. The main Repository menu and file actions continue to target the default; additional direct launch entries are in the shared repository/branch/worktree folder menus.

## Findings and disposition

1. **Accepted, completed:** folder-actions.ts explicitly added VS Code independently of the selected editor. Replaced this with configured entries; regression confirms no implicit VS Code action.
2. **Accepted, completed:** array-position keys could remount the wrong custom form when removing an earlier row. Stable row keys and a regression preserve the surviving name/path draft.
3. **Accepted, completed:** CustomIntegrationForm previously published only valid input, allowing a parent validator to see an older value while an invalid draft was displayed. Editor forms now opt in to publishing raw drafts; preference save validates current custom paths/arguments and required additional-editor names before writing settings. Shell and one-off form behavior retains its existing opt-out default.
4. **Accepted, completed:** asynchronous path validation could finish after removal or after a newer input. Validation version checks discard stale/unmounted completions; final tests have no React unmounted-state warning.
5. **Informational:** detected editor labels use their existing friendly names; custom default profiles without a name use “Custom editor”. No new launch mechanism or shell command interpolation was introduced.

## Validation

- 6/6 focused tests pass: app/test/unit/ui/folder-actions-test.tsx and additional-editors-test.tsx. Covers default/optional routing, duplicate handling, exact paths including spaces/symbols, repository/branch/worktree reuse, missing-checkout disabling and custom-row editing/removal.
- TypeScript --noEmit --skipLibCheck passes.
- Focused ESLint passes with only the known unavailable installed rule @typescript-eslint/no-empty-object-type disabled; project configuration unchanged.
- Prettier and git diff --check pass for the changed implementation/tests.
- Base: desktop-improvements, fb2943f4e35bb6328bcc14e6f8a24ab6b6043399; uncommitted tested sources listed in configured-editors-20261106-source.txt. Earlier TODO.md/Codex-ToDo.md migration and repository-overview proposal work are preserved.

Limits: no packaged build, actual external-editor launch, restart persistence acceptance or visual review in the running application. Persistence and dispatch wiring were assessed from source; focused tests use UI components/menu callbacks. No commit, push, server access, deployment or user-profile edits performed.

## Requested rebuild receipt

On 6 November 2026, production compilation and Windows x64 local packaging completed for the unchanged source manifest. Output: D:\code\git-desktop\dist\GitDesktop-win32-x64\GitDesktop.exe, product/file version 1.0.0, upstreamVersion 3.6.10, Electron 44.1.1. Installed Node 24.21.0 was used; pinned 24.22.1 is not installed. Normal packaging failed on github.com DNS while downloading Electron; the existing script/package-local.mjs reused the prepared out bundle and installed runtime successfully. Logs: editor-settings-prod-build-20261106.log and editor-settings-prod-package-20261106.log. Verified compiled settings labels/storage key and working bundled credential-helper dispatch (expected DESKTOP_PORT guard outside the app). No app launch or user-profile changes; visual and restart-persistence acceptance remain unverified. No additional actionable findings.
