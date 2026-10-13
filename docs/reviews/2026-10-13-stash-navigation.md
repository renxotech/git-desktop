# Stash navigation

Implemented the stash-navigation idea from upstream
`pop-stashes-from-branch-menu` against the current fork, without merging the old
branch.

Use **Branch > Stashed changes…** to choose a stash, or right-click the current
branch toolbar button and open **Stashed changes**. The list contains the latest
Desktop-created stash for each branch, in newest-first order. CLI-created stashes
and older entries for the same branch are outside this feature's scope, matching
the existing Desktop stash store. An empty list says **No stashed changes**.

Choosing an entry previews its files and diff in Changes without checking out
its branch, restoring files, or removing the stash. The header names the source
branch. The selected stash has independent preview state; the current branch's
stash remains authoritative for checkout warnings and stash overwrite checks.
The sidebar stash button returns to working changes.

Background refreshes retain a preview while its SHA remains available. A removed
or replaced stash closes the preview, and a branch change clears it. Asynchronous
loads validate the selected SHA again before displaying it and reject superseded
requests, repository switches, and requests abandoned for working changes. Menu
actions capture SHAs rather than mutable reflog positions.

Restore and Discard retain their existing behavior and confirmation handling.
Restore applies the selected stash to the current checkout and removes it; the
description states this destination explicitly. Browsing alone is read-only.

Validation includes a real Git preview test, refresh/deletion/load-order tests,
existing Git stash tests, and menu tests. Native UI click-through and packaged
application validation have not been performed. The normal TypeScript check is
blocked by the existing dependency `WeakMap` declaration conflict; application
checking passes with `--skipLibCheck`. Scoped lint requires disabling the
unavailable installed rule `@typescript-eslint/no-empty-object-type`, plus the
existing `ban-types` finding on the unchanged sidebar component state type.
