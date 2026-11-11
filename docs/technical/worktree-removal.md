# Removing merged worktrees safely

The removal preview checks the selected worktree, its index and private submodule metadata. Tracked staged or unstaged edits and unmatched untracked files block removal. An ordinary submodule checkout may differ from the comparison target, or lack the target commit locally, when its complete existing local Git history can be independently retained. These differences are history notices, separate from actual dirty files. No automatic fetch, reset, initialization or repair is performed. Missing local HEAD or corrupt local history remains blocked.

## Disposable paths

Place an ordinary `.safe_to_remove` file in the selected worktree root. It uses case-sensitive Git ignore pattern syntax, including comments, `*`, `**`, leading slashes and `!` negation. Patterns are relative to that root, including submodule paths. Nested policy files are not read. A policy file over 1 MiB, a linked policy file, or linked root/ancestor is rejected.

For example, a project can explicitly declare these generated directories:

```gitignore
# Reinstallable dependencies and generated output
/node_modules/
/app/node_modules/
/dist/
/out/
```

These are examples, not built-in defaults. Only declare paths whose local contents may be discarded. No blanket documentation or temporary-directory rule is supplied. Keep the policy tracked and unchanged, or account for its own untracked status explicitly. It is not automatically disposable.

Git ignore negation cannot re-include a file below an excluded parent. To keep a file while discarding its siblings, match the directory contents rather than excluding the parent:

```gitignore
/generated/*
!/generated/keep.txt
```

Only paths already classified as untracked or ignored can match. Tracked edits, Git metadata, nested repositories and submodule ownership/integrity protections always take precedence. The preview shows matched paths inside the collapsed **Disposable files matched by .safe_to_remove** section. They are included by the final removal confirmation without a separate ignored-files checkbox. Directory links and junctions are unlinked; their targets are not traversed or archived.

Unmatched root ignored files still require the existing explicit ignored-files checkbox. Unmatched ignored files inside an ordinary submodule remain blockers, as before. Unmatched untracked files anywhere remain blockers. A policy cannot grant permission to remove tracked edits or staged gitlink changes.

## Retained submodule history

Removal requires explicit confirmation for submodule checkouts and metadata retention. Complete private metadata containers are retained, including inactive nested modules, refs, private branches, local commits, stashes, reflogs, loose objects, packs, indexes and otherwise unreachable objects. Local objects are checked with Git integrity validation. Missing target history does not require synthesizing target objects. Shared or ambiguous ownership, object alternates (including external stores), object-routing diagnostics, shallow/partial-clone history, external config includes, legacy grafts and linked metadata block removal.

Each retained metadata file receives a SHA-256 digest. The exact preflight metadata snapshot is revalidated before movement and verified at its saved location before any checkout files are deleted. Policy contents and identity, actual file inventory and Git state are rechecked at action time. New or changed paths require another review. Cleanup uses checked unlink/rmdir operations and never recursive link traversal. These checks reduce accidental concurrent changes; they do not provide an atomic transaction against hostile external writers.

Archives live under the shared Git directory's `desktop-worktree-metadata-backups/<id>/`. Numbered directories preserve each private metadata container. `restore.json` records the original locations, submodule checkout pointers and per-file manifests; `README.txt` provides recovery instructions. Retain the entire archive. Inspect refs and reflogs with `git --git-dir <saved-module-directory> show-ref` and `git --git-dir <saved-module-directory> reflog show --all`. `core.worktree` may still refer to the removed checkout.

For restoration, stop repository writers and copy numbered containers to their recorded original locations without overwriting existing metadata, then restore the recorded checkout `.git` pointers. Recreate a checkout from its saved HEAD only after preserving the archive. An archive may contain local history unavailable from any remote. If cleanup stops after moving metadata, the error reports the retained archive and the branch is kept; use that record to recover before retrying. No retention expiry or automatic archive deletion is imposed.
