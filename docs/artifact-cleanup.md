# Build artifact cleanup

Right-click a repository and choose **Clean build artifacts…**. Select the worktrees to inspect, set the retention period, and choose whether to include dependencies or caches. Build outputs are included by default. Preview lists the full paths, estimated sizes and skip reasons. **Delete eligible folders** removes the eligible whole folders in that preview. Stop builds/dev servers before cleaning; close Unity before removing its Library cache.

The default retention is 24 hours. Age uses the newest filesystem change evidence throughout each folder, not branch commit dates or last use. A recent member preserves the entire folder. Zero hours includes all eligible ages. Deletion is permanent; dependencies and caches must be restored by the project's normal tools. Shared machine-wide caches are outside scope.

Each worktree can contain `.gitdesktop-cleanup.json` at its root:

```json
{
  "version": 1,
  "keepHours": 24,
  "artifacts": [
    { "path": "web/dist", "kind": "output" },
    { "path": "web/node_modules", "kind": "dependencies" },
    { "path": "mobile/.dart_tool", "kind": "cache" }
  ]
}
```

Paths are explicit, relative to the worktree root; globs, overlapping paths and parent traversal are rejected. Paths must be ignored by Git and must contain no tracked/staged files, links, nested repositories or protected configuration. Never list source/data directories. Missing outputs are skipped normally. `kind` is `output`, `dependencies` or `cache`. The dialog can edit these rules for the current session. Save the JSON to the root file yourself to share it with the project; the dialog does not write project configuration.

Without configuration, bounded discovery suggests Node/React dependency and existing output folders, Gradle module build folders (including Kotlin/KMP), Flutter build/tool folders, and Unity Library/Temp caches. Suggested paths still require preview. Go and custom Unity player-build paths need explicit rules because output locations vary. Unknown projects prompt for rules in the editable configuration. Monorepos use explicit prefixed paths in the same array. The initial retention value comes from the first discovered checkout's configuration (otherwise 24); the selected dialog duration applies to all selected worktrees.

Scan cancellation is checked during artifact traversal and between roots; cleanup cancellation stops between folders. Filesystem/Git errors are reported per folder. The service rechecks registration, configuration, tracked status and folder metadata immediately before deletion. Concurrent external writers cannot be made atomic with cleanup; stop them first. Junctions and symbolic links are skipped, including shared node_modules. Large dependency trees require a full metadata traversal and may take time.
