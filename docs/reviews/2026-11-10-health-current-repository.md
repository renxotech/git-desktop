# Repository Health: current repository scope

User request: Repository Health and Repository menu actions such as Fetch all remotes operate on the current repository. Owner: this chat; D:/code/git-desktop, desktop-improvements. Date: 2026-11-10.

## Change

Repository Health now captures the selected Repository in its popup payload. No selection means no popup. The native menu is enabled only for an active repository (also disabled while hidden or in welcome flow). The dialog inspects that repository only; registered worktrees remain part of the same common Git identity. Added repositories are used solely to navigate Open in Desktop, not for scan/operation targets. Folder and added-repository scopes, bulk repository selection and attention-only filtering are removed from this dialog. Fetch all remotes and Safely update worktrees use the resulting single repository, including clean results.

Existing Repository menu Fetch already calls dispatcher.fetch with selectedState.repository, and pull/push similarly use selected repository flows. No changes to those operations were necessary for repository scoping. This work does not redefine which remotes normal Desktop fetch considers relevant. It makes no actual remote requests for verification.

## Review and findings

- Scope leak through broad dialog scan: accepted and fixed by required repository prop and removal of broad scan paths. A selected submodule repository can itself be checked; parent health does not recursively scan unrelated added submodules.
- Menu could be enabled without a selected repository: accepted and fixed by repository-scoped enabledness plus event guard.
- Healthy repositories were hidden from action selection: accepted and fixed by displaying the single result and enabling actions independently of attention findings.
- No further actionable source findings in this chunk. Existing update checks and same-identity lock/refresh infrastructure retained. New update preview, remote metadata/freshness and unknown/publication labels are separate design recommendations, not implemented here. Folder Group expansion stays deferred.

## Validation and limits

Combined first run: 19 passed, one new test failed because enabled buttons omit aria-disabled rather than returning the string false. Corrected that assertion; affected UI/menu rerun: 7/7 passed. Reuse first run's 13 passing health-service/locking tests, for 20 focused passing tests total. Tests cover current clean repository with another added repository, registered sibling worktree targets, fetch and update dispatch, submodule exclusion, and no-selection/hidden/welcome menu states. Operations use disposable repositories and mocked dispatch for UI actions; no real user repository fetch/update executed.

TypeScript --noEmit --skipLibCheck passed. Scoped Prettier and ESLint fix/check passed; missing installed @typescript-eslint/no-empty-object-type excluded as in prior checks. Used scoped equivalent of lint:fix instead of repository-wide automatic rewrites to preserve concurrent cleanup menu/build work. Whitespace check passed. Source/test LF endings restored to avoid whole-file churn; no behavior changed after passing tests.

Concurrent artifact cleanup commit 135bf5f7b6 incorporated this task's app.tsx popup wiring while this task was in progress. Remaining health changes are uncommitted; no commit or build was requested here. Source snapshot: health-current-repository-20261110-source.txt. No packaged visual acceptance, launch, push or deployment. A fresh build is required to see the complete change in the packaged application.
