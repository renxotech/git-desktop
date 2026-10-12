# Upstream development integration on test

The `test` branch integrates upstream development at
`c37f28a9a561547778a0edbb93e8d0eea47f036a` into the fork baseline
`9126b57718043908046d9a67c3e115964ccb79c5`. The upstream snapshot is dated
2026-10-09. This is a development snapshot, not evidence that these changes
are in an official published binary. The package version is `3.6.7-beta3`.

## Integration decisions

- The single content conflict was in `app/webpack.common.ts`. Preserve the
  fork's product-name titles for the renderer and crash window alongside
  upstream's target-specific Koffi native-module bundling.
- Retain fork changes for broader foreground fetching, repository health,
  folder groups/actions, worktree repair, aliases, pinning, sandbox rules,
  update-feed handling, and local Windows packaging.
- Preserve the pinned submodule revisions. The custom gitignore commit was
  unavailable from its upstream remote; recover that exact object from the
  existing local checkout rather than substitute a different revision.
- Use independent root and application dependency installations in the test
  checkout. Remove only its former application dependency junction to the
  main checkout. Use a checkout-local Node 24.19.0 runtime; the system Node
  version and the main checkout's dependencies remain unchanged.

## Validation and small test corrections

- Build-script and application TypeScript checks passed.
- Source lint passed. The sandboxed Yarn lint process initially crashed;
  running the installed linter directly outside the sandbox completed.
- Production Webpack compilation, asset staging, and Windows local packaging
  passed in the test checkout's own output directories.
- A packaged-app smoke test passed using a newly created temporary profile,
  isolated Git configuration, and disposable repository. It verified setup,
  repository loading, diff rendering, local commit, branch creation, and
  switching back to the original branch, with no renderer errors.
- The full unit run exercised 2,316 tests: 2,312 passed, three were skipped,
  and one failed because the tutorial test expected the upstream product
  name instead of the fork's welcome heading. Change that heading assertion
  to use `__APP_NAME__` without changing the product UI.
- The same full run encountered a remote test fetching the deliberately
  nonexistent `desktop/not-found` repository and waiting for authentication.
  Stop only that test's blocked fetch. Replace the network request with local
  promisor/filter configuration, which is the metadata being tested.
- After both test-only corrections, rerun the complete remote and tutorial
  test files: all 15 tests passed. Formatting and lint for the changed tests
  passed. The full suite was not repeated after those corrections.

The current Git Desktop instance was left running. The general build helper
refuses to build while any instance is open, so its compile, asset-staging,
and packaging stages were invoked directly after verifying that the test
checkout had separate output directories.

## Boundaries and rollback

No push, installed-app replacement, or merge into `desktop-improvements` is
part of this integration. Private GitHub authentication, live Copilot
operations, and credential renewal against actual providers remain unverified;
the corresponding automated checks use test doubles or local fixtures.

The prior fork baseline and running package remain available. Keep the
integration on `test` until real-account testing is satisfactory. Returning
to the prior package does not require a Git history rewrite. Avoid rolling a
real profile back across credential-storage changes without a consistent
profile backup; the smoke test used a separate profile.
