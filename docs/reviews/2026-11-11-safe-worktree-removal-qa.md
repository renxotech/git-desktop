# Independent backend QA: safe worktree removal

## Acceptance and exact source

Accepted on 2026-11-11: **25 automated backend tests passed, zero failures/skips**, using disposable Windows Git repositories and real junction entries. No actual project/user worktree was removed. Implementation and tests remain uncommitted in `D:/code/git-desktop/.worktrees/submodule-junction-cleanup`, branch `codex/submodule-junction-cleanup`, upstream `origin/desktop-improvements`, base HEAD `d95892e06f3290f4aa97a12a7b9869470cd7258a`.

Production source remained frozen throughout the final run; all six SHA-256 values were checked again afterward:

| File under `app/src/` | SHA-256 |
| --- | --- |
| `lib/git/worktree-branch-removal.ts` | `5093aaeba8e0b31b2e94840de3addb06ded5b8240042d23de5f5eb30ba578fc0` |
| `lib/git/worktree-cleanup-files.ts` | `84f3b50b031c42466da2dace31ef399159f1dea1b8e9db194ebd6397a9922af8` |
| `lib/git/worktree-removal-submodules.ts` | `fe8a347f9236f6319afab89f93b9fad711c7ba28137e4ba6d16c24c7c1dd737e` |
| `lib/stores/app-store.ts` | `9b8daeb9b5e36da3a078933a51cc2e1a536840d8711777c6be74823a1a033c43` |
| `ui/branches/unmerged-branches-dialog.tsx` | `6205a4fe6d2d6aaf957c9626039f21432cb0ebffeecf5d18a1c348827d7668b6` |
| `ui/dispatcher/dispatcher.ts` | `746565bcaefe9e6bb67c12576b73932b5bff21bb6eee4598929030810a5f805a` |

## Commands and retained evidence

Run from the isolated worktree with `TEMP` and `TMP` set to its `tmp/safe-cleanup-qa/fixtures` directory:

```text
npm test -- app/test/unit/git/worktree-branch-removal-test.ts app/test/unit/git/worktree-safe-removal-test.ts
node_modules/.bin/tsc.cmd --noEmit --skipLibCheck --pretty false
node_modules/.bin/eslint.cmd --rulesdir ./eslint-rules --rule '@typescript-eslint/no-empty-object-type: off' app/test/unit/git/worktree-safe-removal-test.ts
git diff --check
```

All passed. Only the known unavailable installed ESLint rule was disabled. The final backend run took approximately 118 seconds. `tmp/safe-cleanup-qa/backend-tests-final.log`, `typescript.log`, `frozen-source-final.json`, `frozen-source-final.patch`, and copies of the two new production helpers plus the new test file retain exact dirty-source evidence locally. The temporary evidence directory is ignored. The test harness retired all disposable repository/worktree fixtures; only Node/tsx compilation caches remain there. No dependency installation or changes to main-checkout dependencies occurred.

## Covered behavior

- Existing eight removal regressions remain unchanged and pass: clean removal, fresh untracked/staged blockers, shared stash preservation, current/main/locked worktrees, target drift/unmerged branch, ignored consent and changed ignored lists.
- Real Windows junctions at the ignored dependency path and inside an ignored directory are unlinked without changing sentinel contents in the disposable main dependency target, the disposable main tracked checkout, or a sibling file.
- Same-name junction target replacement and changed ignored-file content reject stale confirmation before removal.
- Clean and empty missing-index submodules require explicit consent, retain metadata, and remove successfully. Restoring the retained directories and pointer layout recovers HEAD, local refs, stash objects and a usable tracked-file checkout. Recovery manifest paths and pointer text are asserted.
- Embedded `.git` directories remain readable from their retained archive after checkout removal.
- Genuine submodule modified, staged, untracked, unique-commit and intentional staged-deletion states block removal and preserve the branch/metadata. Main-checkout metadata aliases are rejected.
- A transitive external object alternate pointing back into selected ignored output is rejected.
- Existing sandbox and assisted-commit protections reject cleanup before filesystem mutation.
- A deterministic backend interception advances the real branch immediately before compare-and-delete; the newer commit survives. Injected unregister failure reports partial changes and keeps the branch and retained archive.

## Findings and dispositions

- **Accepted/fixed:** the first executable batch identified a false stale-plan rejection after a completed stash cycle changed only directory timestamps. Production now compares directory object identity and exact descendants; the original stash test passes unchanged. File/link content, identity and target drift still reject.
- **Environment limitation, resolved for final run:** managed default temporary storage prevented Git object writes; using task temporary storage enabled ordinary Git, but submodule setup still hit the managed MSYS object-creation restriction. The final run used approved normal local access and the same disposable task fixtures. These setup failures provide no product acceptance evidence.
- **Test fixture defects, fixed:** Windows hidden `.git` pointer files required unlink/recreation for the intentional metadata-alias fixture; relocated embedded metadata needed explicit config-file update before Git could use its new `core.worktree`. Neither required production changes. Final tests use the original safety expectations.
- **No unresolved actionable production defect found by QA.** Independent source-review findings and fixes are recorded in the linked implementation/source-review reports.

## Limits and recovery

UI/browser/manual tests, packaging/build, launch, integration, commit, push, deployment and actual user worktree cleanup were excluded. Source review covers additional fail-closed branches beyond this focused runtime suite, including unusual routing, inactive metadata, hidden-index and root/ancestor ownership conditions. The suite does not establish atomic safety against an uncooperative concurrent filesystem writer between path-based checks and mutations; partial errors require fresh review.

Retained metadata uses `<common-git-dir>/desktop-worktree-metadata-backups/<uuid>/restore.json` plus numbered intact metadata directories. The operation returns that exact UUID directory. The manifest identifies original metadata locations and pointer text; recovery must inspect existing destinations before restoring the original layout. Fixture recovery was exercised automatically; user data was never restored, reset, or removed.
