# Development merge resolution — 2026-11-10

Branch desktop-improvements, starting HEAD c7af79e86a; incoming development edcf9a4f09a8582f82e8c11e45cea336be669d7f. User authorized conflict resolution, no commit or push requested.

Resolved 13 conflicting files. Preserved fork branding/version 1.0.0; upstreamVersion updated to 3.6.11-beta1 and app lockfile root version synchronized. Combined npm scripts with local build:test. Combined sandbox enforcement with incoming repository operation fences; literal path handling with snapshot diffs; branch discovery with configurable submodule recursion; history search with awaited comparison; both component lifecycle states; health and creation dispatcher methods; disabled assisted-run controls with sandbox fetch and sorted worktree choices. Worktree creation saves sandbox rules within the guarded store operation before switching.

Independent integration assessment: accepted/fixed automatic-merge hard-reset parameter loss, removed account lookup compatibility, and new required test props. Accepted/fixed UI test timing: five commit tests now await aria-disabled clearing after sandbox lookup. Production protection remains enforced. No remaining actionable findings in inspected conflict scope. Broader incoming assisted-commit code has not received an exhaustive audit.

Validation: TypeScript --noEmit --skipLibCheck passed. Focused source lint passed with unavailable installed @typescript-eslint/no-empty-object-type rule disabled; no dependency installation performed. Final focused tests: 146 total, 136 passed, 10 platform skips, zero failures. Includes fetch, submodule, diff, worktree dialog/guards, commit message, folder groups/actions and history search. Used --test-force-exit for UI handles; initial restricted run failed temporary Git fixture access and was superseded by normal-access runs. Logs at repository root: merge-final-tests.log, merge-typecheck.log, merge-lint.log, merge-test-lint.log. No build or installed acceptance. Review source hashes below identify resolved source.

- app/package.json: 16dbc21cc995efb8193f1957b914d5965420f81b983212b4a38871460a5e59b1
- app/package-lock.json: 1e089a14e9aa9c39e90b1991ecc3f601ca0c154849dcc24e055b3a992239d369
- package.json: 70580e4c988b4d0f949a3a5a0af9f40eb0c15a172f35f59de96c16f5c1481543
- app/src/lib/git/core.ts: e12d0c04da929d98c02860f82d89df4672b381dde12880721ba6888fe6b566d7
- app/src/lib/git/diff.ts: 30344a5ce4397f23b56f77ae7a82073d33c317be78dfebc1bfdfd8a04e0aac61
- app/src/lib/git/fetch.ts: eb6a8735fabe7de99fb235f41e7a96c3455a9f2d149b47ef61bc7a3e90ec74ce
- app/src/lib/stores/app-store.ts: 2e1b7cc2accb61c43c8caeaf5282bf44c3601d555975f4bace72681b619d2f22
- app/src/lib/sandbox-release-loader.ts: 74f5897d4fab01f08a96212823d5e92896b817556c16c17fe85f84ec57dccd09
- app/src/ui/changes/commit-message.tsx: 0504883bfd95b28ab8d4b2631091dc53764fe16ae7520132c8197fb727a921b6
- app/src/ui/dispatcher/dispatcher.ts: 1f68bff0b456f537eb5bf2fe0119606ccb89e07de0a84bbbf76e11c487a442fe
- app/src/ui/toolbar/push-pull-button.tsx: 629418f3c04d04a798ef0adb0ec70770e41e5787bc3d0eba64021c7e3d583c3a
- app/src/ui/toolbar/worktree-dropdown.tsx: 30b4727e3ffce7149825695b9d58942ed218ddf85a24cd5eae86bad5e90fd027
- app/src/ui/worktrees/add-worktree-dialog.tsx: ebc60e97b4d20fa109f63f36cd3c5aabda909016da3f52c0306620626a0c86f1
- app/test/unit/git/fetch-test.ts: 4f0fa6c6f400b299d0c872ccd269dafc2a984473a47c7d62de842fa37074bbe4
- app/test/unit/git/submodule-test.ts: 27d6c51a1ef3462a5f47419b0b273d16935649f3788ede29fb3b0f289e843171
- app/test/unit/ui/commit-message-test.tsx: 7f4a3ee98a7a39a8480940180b06aa2436146a80749268248a25fe23851cb78e
- app/test/unit/ui/collapsed-folder-groups-test.tsx: 7bc332b30e7f5cecc283f454c7f915c58b33871d584ae1158bda7de9d1f7d138
- app/test/unit/ui/commit-search-test.tsx: 180ac00b8fbe0033bf6c78073a723376558a0d1455e7a6315387fb4eaa722709
- app/test/unit/ui/folder-actions-test.tsx: de333626a226985073983190be49fd89f5ebac362eda6935ac451b6e1eb51ff7
