# Editors, shells and file targets — 8 November 2026

## Requested outcomes and assessment

Implemented in the main desktop-improvements checkout, base fb2943f4e35bb6328bcc14e6f8a24ab6b6043399 plus the earlier uncommitted editor settings work.

- Options section is now **Editors, Shells and other Integrations**; its sidebar label wraps within the existing navigation width.
- Default shell plus additional detected/custom shells are configurable. Additional custom entries have a friendly name, executable and arguments. Shared folder menus now reflect these settings, suppress duplicate detected shells and preserve exact checkout paths. Old profiles without an additional-shell setting retain detected Command Prompt, WSL and PowerShell quick entries; explicitly saved empty lists remain empty. Shell settings use the existing Save/Cancel lifecycle and local storage.
- Windows Notepad is detected from System32; Notepad++ now also supports per-user uninstall registration and conventional Program Files/local locations. Existing detection for VSCodium, VS Code, Sublime Text and other supported editors remains available. Dropdowns show detected installed editors; portable/unrecognized installations can use custom entries. No applications are installed by this change.
- The default and each additional editor have an **Opens: Files only / Files and folders** setting. Windows Notepad and Notepad++ initially default to files only; the user can override either. Older entries without this setting infer a compatible default.
- Repository/branch/worktree folder context menus omit files-only editors. Individual-file context menus in Changes (including rebase), History and pull-request files offer all configured editors. Files tab tree now also offers editor actions for its on-disk files; absent files are disabled. Historical snapshot bytes are not passed to an external editor.
- Default-editor repository shortcuts continue to invoke the default. A launcher guard rejects folders for files-only editors, including entry points outside the folder context menus. The native Repository menu continues to target the default and reports a clear settings error if that default cannot open folders.

## Review findings and dispositions

1. **Accepted/completed:** fixed shell menu entries bypassed preferences. Replaced them with configured entries and preserved existing detected quick shells for profiles that have not saved a new list.
2. **Accepted/completed:** Windows Notepad was absent from discovery; per-user/portable conventional Notepad++ installs could be missed. Added system/conventional path discovery and per-user registration; isolated discovery tests cover absent uninstall entries.
3. **Accepted/completed:** WSL detection depended on legacy wslconfig.exe. Detection now uses wsl.exe --list --quiet with a hidden window; a mocked discovery test proves WSL is offered without wslconfig. Existing exact-path/distribution launch regressions pass.
4. **Accepted/completed:** editor folder filtering alone would leave repository shortcuts able to pass directories to file-only tools. Added a filesystem target guard before spawning; regression proves both detected and custom file-only editors reject directories and configured overrides reach executable validation.
5. **Accepted/completed:** default editor/shell Select components supplied aria-label props that the wrapper did not forward. They now use supported visible labels; settings UI tests use those accessible labels.
6. **Accepted/completed:** filtering a files-only default could wrongly suppress a folder-capable additional entry of the same detected name. Deduplication now starts from the actions actually present.
7. **Accepted/completed:** editor validation errors were positioned as an extra child in the horizontal preferences layout. Moved the banner above the layout.
8. **Informational:** full source lint encountered unchanged ChangesSidebar's empty state type. Only that file's pre-existing ban-types violation is excluded in the focused lint receipt; no production lint configuration changed. The known unavailable no-empty-object-type rule is also disabled as in prior checks.
9. **Informational:** repository-health UI implementation remains a separate, unauthorized design backlog; Folder Group expansion remains deliberately deferred. Neither was implemented here.

## Validation and limits

- **26/26 focused tests pass** across configured editors/applications, shared folder actions, editor target enforcement, Windows application discovery, WSL launcher and existing Files explorer integration. Receipt: ../../configured-applications-tests-20261108.log.
- TypeScript --noEmit --skipLibCheck passes. Focused ESLint passes with the two narrowly described existing-tool/source exclusions above. Formatting and whitespace checks pass.
- Tests exercise UI drafts and callbacks, capabilities/menu selection and exact routing; temporary fixtures and mocked detection/spawning avoid launching real editors or shells. Existing WSL launcher tests retain exact path/distribution/metacharacter coverage.
- Source manifest: configured-applications-20261108-source.txt (all changed/new implementation, style and test files; SHA256). Changes remain uncommitted. No build, application launch, profile edit, install, commit, push, remote or server operation occurred in this follow-up.
- Packaged visual acceptance, actual shell/editor launches and Save/restart persistence acceptance are **unverified**. Persistence wiring was reviewed in source. The successful 6 November package predates this follow-up and does not contain it.

The ledger is ../Codex-ToDo.md; root Codex-ToDo.md and TODO.md are compatibility pointers. Existing historical receipts were retained during the scoped migration.

## Requested rebuild — 10 November 2026

Production compilation/resource preparation passed in 104.98s using installed Node 24.21.0. Local packaging with installed Electron 44.1.1 passed at D:\code\git-desktop\dist\editors-shells-20261110\GitDesktop-win32-x64\GitDesktop.exe after the standard output folder failed removal with EBUSY. A temporary copy of the existing local packager changed only its distribution root; it has been removed. Product/file version is 1.0.0 and upstreamVersion is 3.6.10. Verified renamed settings, shell controls, editor capabilities and storage keys in packaged renderer; all 31 source hashes still match the tested manifest. Bundled credential-helper dispatch reaches its expected DESKTOP_PORT guard. Logs: ../../editors-shells-prod-build-20261110.log and ../../editors-shells-prod-package-alt-20261110.log; initial locked-folder log: ../../editors-shells-prod-package-20261110.log. No new actionable source finding. App launch, visual checks, actual shell/editor launch and Save/restart acceptance remain unverified; no commit/push/profile changes performed.

## Commit review — 10 November 2026

Rechecked the complete editor/shell source and exact commit scope against the tested SHA256 manifest: all 31 files are unchanged since 26/26 focused tests, static checks and successful production packaging. No actionable new finding. Whitespace check passes and the index was empty before staging. Prior test/build receipts remain applicable; no repeated tests or source edits. The local commit containing this receipt includes editor/shell changes, their review/source evidence and the shared ledger migration/pointers. Independent unmerged-branch sorting changes and unrelated design documents are excluded. No push is requested. Packaged visual, actual external application launch and Save/restart acceptance remain unverified.

Staged whitespace receipt: new files retain the exact tested Windows CRLF bytes, consistent with the project's Prettier endOfLine:auto. Git's default whitespace check flags these carriage returns; git -c core.whitespace=cr-at-eol diff --cached --check passes. No source bytes, repository attributes or Git settings were changed to resolve that platform-formatting diagnostic.
