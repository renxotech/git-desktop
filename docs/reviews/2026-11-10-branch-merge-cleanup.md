# Branch merge and cleanup views — 2026-11-10

Implementation and source review in D:/code/git-desktop, desktop-improvements, HEAD aaee0ed399ca75694c88abc9619ceca293645b8e plus uncommitted changes. Unrelated existing edits preserved; no commit, push, package or launch performed.

## Accepted outcomes
- Adjacent Merged/Unmerged buttons replace the branch-picker merge footer.
- Searchable, single-selection lists use tip committer date descending; main picker retains pinned default branch and combines remaining branches into one date-sorted group.
- Direct merge initializes the existing operation and uses existing progress/conflict handling. Successful completion returns to refreshed candidates when no other popup is present and the same repository is selected.
- Comparison against other targets remains available; Merge requires current HEAD. Detached HEAD cannot merge.
- Removal uses existing local/remote confirmation dialogs; local remote-removal option defaults off. Current/default and worktree-checked-out local branches cannot be selected for removal. List refreshes after confirmation dismissal/deletion.
- Divergent branches remain candidates, with both-side counts and linked checkout paths. Verified local Git metadata: D:/extcode/github-desktop is development, with 212 candidate-only and 58 current-only commits, common ancestor df044eecee5f187241b1ed11ceb1a1025c7766df. No remote fetch or server access.

## Review and disposition
- Source review: no outstanding actionable findings within scope. Checked target direction, symbolic ref exclusion, branch selection reset, request invalidation, conflict-popup preservation, worktree removal protection and confirmed deletion reuse.
- Fixed during validation: test dialog queries needed hidden:true in this test environment; source line endings restored to LF to avoid unrelated churn. These are completed dispositions.
- Informational: ancestry classification does not recognize squash/cherry-pick equivalence. UI states this explicitly. Separate unrelated repositories are outside scope; the supplied path is a linked worktree sharing refs.

## Validation
- 12/12 focused tests passed: node script/test.mjs app/test/unit/git/unmerged-branches-test.ts app/test/unit/ui/repository-health-dialog-test.tsx app/test/unit/group-branches-test.ts
- Coverage includes committer-date ordering/ties, merged classification, invalid targets, divergent linked worktree paths, target changes, current-branch protection, removal confirmation and direct merge dispatch.
- TypeScript --noEmit --skipLibCheck passed. Focused ESLint passed with the known unavailable installed rule @typescript-eslint/no-empty-object-type disabled. Formatting applied.
- Restricted Git fixture writes initially failed; tests passed with normal local Git access. Existing React test-environment/deprecation warnings remain.
- Limits: no packaged visual/manual acceptance, real remote deletion, or installed conflict-resolution flow exercised. Direct merge UI test verifies dispatch using real mergeability analysis; existing merge machinery handles execution.

## Tested source SHA-256 manifest
- app/src/ui/branches/branches-container.tsx: 16020c61e29bae3aa2307c259b5e3716b840004f2f1f489d12df2dc9a912f8f9
- app/src/ui/branches/branch-list.tsx: bf43e1903895f77e5a7e1a3392d5c9dbbcf21a1e62f5105352751a6c439bde1c
- app/src/ui/branches/group-branches.ts: 8d2bbc86e09b6514f39d54c25f484b4083e1a285eccaf5efa73dae6c3b7612da
- app/src/ui/branches/unmerged-branches-dialog.tsx: 2a000555075747acf647239d3557322133f8019a705c70c6d7f05f045658c595
- app/src/lib/git/unmerged-branches.ts: 246edca3c5e65c7dd0bfdc8f77d1cbb3be4ec1d6824b1b7d6a14bdc9fccccca7
- app/src/models/popup.ts: 9c8857b172c3a4f68c6914db165d036fc6bf2856844dd50ae7993c78ded1b8f6
- app/src/ui/app.tsx: 03eb609fb79b1790e6cdf57eeebf1bc48de89b26c59a13d82809365a61e164c7
- app/src/ui/dispatcher/dispatcher.ts: 065bfe0bbfaa016296b5c78dd081d9c925ffc17e55a436c34f042d82451c7e2a
- app/styles/ui/_repository-health.scss: 7af7ac83d5d721a0242bfbcc5e0b1fb588a5dd332ca4b9139d5de1278ec43091
- app/test/unit/ui/repository-health-dialog-test.tsx: db47067d007422be864a434d4c04a4fad907f6870012adf74997af85236b19d4
- app/test/unit/git/unmerged-branches-test.ts: 27167ceda6fc41db2cd5f3a92f889643f0f86d42b3c8d404fa87cb95b360e504
- app/test/unit/group-branches-test.ts: 5e17c4252c0db3402bf86f7cd25431f73536ebc592a4c70a84ae2363f379d298
