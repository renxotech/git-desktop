# Review: sandbox fast-forward rules, worktree aliases, WSL launcher (2026-10-01)

Historical initial opinion. Some proposed remedies were rejected by the
[independent review](2026-10-01-sandbox-rules-independent-review.md), including
changing this PC's WSL distribution and failing open on malformed rules.
See [2026-10-11 remediation](2026-10-11-sandbox-rules-remediation.md) for current status.

Uncommitted changes in `D:\code\git-desktop` on `desktop-improvements` (HEAD `2e5c746`): 19 modified files (~360 lines) plus new files:

- `app/src/lib/sandbox-rule.ts`, `app/src/lib/git/sandbox-rule.ts`, `app/src/lib/sandbox-release-loader.ts`
- `app/src/lib/shells/wsl.ts`, `app/src/lib/worktree-alias.ts`
- `app/src/ui/banners/sandbox-updates.tsx`, `app/src/ui/worktrees/{change-worktree-alias-dialog,sandbox-rule-dialog,sandbox-rule-results}.tsx`
- Tests: `sandbox-rule-test.ts` (x2), `sandbox-release-api-test.ts`, `sandbox-rule-dialog-test.tsx`, `worktree-alias-test.ts`, `wsl-launch-test.ts`
- Plan: `docs/plans/release-tracking-branches.md`

Source read only; nothing was built or run, and the new tests were not executed.

## Status at a glance

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| S1 | WSL launcher hard-codes `Debian-WSL1` | Must fix | Open |
| S2 | Commit box starts disabled and shows the sandbox message on every mount | Must fix | Open |
| S3 | Invalid `desktop.sandboxRules` blocks all protected Git commands and worktree refresh | Must fix | Open |
| S4 | Short branch-name match blocks unrelated commands | Must fix | Open |
| S5 | User fetch in repos with rules bypasses `gitStore.fetch()` | Should fix | Open |
| S6 | Two extra Git processes before every protected command | Should fix | Open |
| S7 | Pull silently becomes Fetch on sandbox branches | Should fix | Open |
| S8 | Unauthenticated release-API fallback | Should fix | Open |
| S9 | `String(error)` in add-worktree rule failure | Should fix | Open |
| S10 | Conflicts with review fixes on `test` branch | Integration | Open |

## Must fix

### S1. WSL distribution is hard-coded

`app/src/lib/shells/wsl.ts` always passes `--distribution Debian-WSL1` and throws for `\\wsl$` paths of any other distribution. Open in WSL fails on any machine without that exact distribution name.

Fix: omit `--distribution` (default distribution), or read it from a setting; for `\\wsl$\<distro>\...` paths, pass that distro instead of rejecting it.

```typescript
const distro = wslPath?.[1] ?? configuredDistribution // undefined = default
const args = distro ? `--distribution "${distro}" ` : ''
```

### S2. Commit box flickers to disabled

`app/src/ui/changes/commit-message.tsx` initialises `sandboxProtected: true`. In every repository, with or without rules, Commit is disabled and "Commits are disabled" shows until `isSandboxProtected` resolves.

Fix: use a tri-state (`'unknown' | 'protected' | 'open'`); disable commit while unknown but render the message only when `'protected'`. Or start `false` when `readSandboxRules` is cached empty.

### S3. Invalid rules config breaks the repository

`readSandboxRules` throws on malformed JSON. It now runs inside `git()` before every protected command (commit, checkout, add, stash, push, reset, …), in `_refreshWorktrees`, `_pull` and `_fetch`. One bad value blocks normal work and hides the worktree list.

Fix: in `assertSandboxMutationAllowed`, fail closed only when the current or targeted branch could be a sandbox (e.g. the raw config mentions it); otherwise log and allow. In `_refreshWorktrees`, catch and show worktrees without rules plus a repair banner.

### S4. Branch-name matching is too broad

`assertSandboxMutationAllowed` treats a command as targeting a sandbox if any argument equals the branch's short name (`args.includes(r.branch.substring(11))`). A sandbox branch named `test` blocks `git add -- test` or `checkout -- test` in any worktree.

Fix: only inspect arguments before `--`, and only for commands where they are refs (`branch -d/-m`, `push` refspecs, `update-ref`, `worktree remove/move` paths). Prefer matching full `refs/heads/...` names or resolved refs.

## Should fix

### S5. Fetch path differs when rules exist

In `AppStore._fetch`, repos with rules call `gitStore.fetchRemotes(…, false, …)` instead of `gitStore.fetch()`. That skips the foreground "all configured remotes, reload remotes and branches" behaviour (C1 in the 2026-09-30 review) and the upstream ahead/behind refresh. Route through `gitStore.fetch()` and add rule remotes to its set.

### S6. Guard cost on every protected command

The guard in `git/core.ts` runs `config --get` and `symbolic-ref` before each protected command in every repository. Cache rules per common Git directory and invalidate on `sandboxRulesChanged`; cache HEAD per call path where already known.

### S7. Pull becomes Fetch without feedback

`_pull` on a sandbox branch silently performs a fetch and rule update. The toolbar button is replaced, but the Repository menu and shortcut still say Pull. Relabel or disable the Pull menu item for sandbox branches, or show a toast explaining the fast-forward.

### S8. Release loader without an account

`sandboxReleaseLoader` falls back to `new API(endpoint, '')` (60 requests/hour) and `suppressErrors: false`, so rate limiting fails the whole update. Mention sign-in in the error, or fall back to the `tag` selector path (`ls-remote`).

### S9. Raw error text

`add-worktree-dialog.tsx` builds the rule-save failure with `String(error)`. Use the shared `errorMessage` helper from the review-fixes branch.

## Integration

### S10. Overlap with the review fixes

This work is based on `desktop-improvements` (`2e5c746`) and does not include the review fixes on the `test` branch (`.worktrees/test`, `cb4f55e`, `cbb9956`, `44fa104`). Both change `app-store.ts`, `app.tsx` and `git/fetch.ts`; expect conflicts in `_fetch`, `_performRepositoryHealthOperation` and the folder-action wiring. Merge or rebase one onto the other before further work on either.

## Looked correct

- Rule saves and updates are serialised per common Git directory (`withSandboxRuleQueue`).
- Desktop's own fast-forward bypasses the guard only via the explicit `sandboxFastForward` option.
- Before `merge --ff-only`: clean status, no in-progress operation, ancestry check, HEAD/branch re-check.
- Release tags are fetched into private `refs/desktop-tracking/...` refs and verified against the advertised tag object; the last tag is pinned, so a moved or deleted tag blocks instead of silently following.
- Branches with rules are excluded from background `fastForwardBranches`.
- Worktree aliases are removed on worktree delete and carried over on move.
- Beta release tags sort numerically (`beta10` after `beta2`).

## Remaining work

- [ ] S1 WSL distribution
- [ ] S2 commit-box initial state
- [ ] S3 fail-open on invalid rules outside sandbox branches
- [ ] S4 narrow branch-name matching
- [ ] S5 unify fetch path
- [ ] S6 cache rules for the guard
- [ ] S7 Pull menu labelling
- [ ] S8 unauthenticated release fallback messaging
- [ ] S9 error helper
- [ ] S10 reconcile with the `test` branch
- [ ] Run the six new test files and a native launch check
