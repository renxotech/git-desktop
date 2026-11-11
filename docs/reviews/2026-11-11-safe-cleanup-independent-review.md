# Independent cleanup safety review

## Scope and source

Source-only assessment of `codex/submodule-junction-cleanup` in
`D:/code/git-desktop/.worktrees/submodule-junction-cleanup`, based on
`d95892e06f3290f4aa97a12a7b9869470cd7258a`. No actual checkout cleanup,
test execution, build, launch, commit, integration or server access was performed
by this reviewer. Backend fixture QA is owned separately.

The frozen backend source reviewed on 2026-11-11 has these SHA-256 identities:

| File under `app/src/lib/git` | SHA-256 |
| --- | --- |
| `worktree-branch-removal.ts` | `5093AAEBA8E0B31B2E94840DE3ADDB06DED5B8240042D23DE5F5EB30BA578FC0` |
| `worktree-removal-submodules.ts` | `FE8A347F9236F6319AFAB89F93B9FAD711C7BA28137E4BA6D16C24C7C1DD737E` |
| `worktree-cleanup-files.ts` | `84F3B50B031C42466DA2DACE31EF399159F1DEA1B8E9DB194EBD6397A9922AF8` |

See [implementation and recovery notes](2026-11-11-safe-submodule-junction-cleanup.md).

## Findings and dispositions

1. **Accepted and fixed: nested staged gitlinks could be hidden.** Initial
   recursive submodule status excluded submodule changes without separately
   reading its staged changes. Every initialized submodule now runs a cached diff
   with `--ignore-submodules=none`. Source correction verified; independent
   execution evidence is pending QA.
2. **Accepted and fixed: selected checkout ownership was incomplete.** Initial
   verification did not compare the selected common Git directory with the caller
   repository, verify symbolic HEAD, or verify the administrative backlink. All
   three guards are now present. Source correction verified; execution evidence
   is pending QA.
3. **Accepted and fixed: successful archive location was not exposed.** The exact
   generated archive directory now returns through AppStore/Dispatcher and is
   shown after successful removal. Separate default-false ignored-file and
   submodule consent remains enforced in the backend. Source wiring reviewed;
   UI execution is excluded.
4. **Accepted and fixed: inactive metadata could own another checkout.** The
   archive ownership scan now verifies registered worktree count and rejects
   nonempty submodule `worktrees` registration directories in addition to checking
   `core.worktree` and `commondir`. Source correction verified; execution evidence
   is pending QA.
5. **Accepted and fixed: direct alternate object stores must survive cleanup.**
   Relative alternates and absolute alternates lexically inside the selected
   checkout/administrative directory are blocked. This closes direct deletion of
   an alternate target. Physical-path checks now also close the alias case below.
6. **Accepted and fixed: direct alternate targets need physical-path checks.**
   The initial alternates guard inspected targets using lexical containment only.
   An absolute alternate outside the
   selected checkout can pass through a junction or symlink into an ignored
   object-only directory inside that checkout. The inventory can then delete the
   real object directory while the archive retains only a pointer through the
   outside alias, losing borrowed history objects. The revised frozen source
   resolves every direct absolute alternate physically and rejects either
   deletion area. Source correction verified; independent regression execution
   is pending QA.
7. **Accepted and fixed: filesystem mutations need operation ownership.** The
   coder identified that moving cleanup from Git into filesystem calls required
   preserving application mutation/assisted-operation protection. The exported
   helper now rejects read-only context, holds destruction and mutation lifetime
   scopes, checks sandbox worktree/ref permissions before filesystem mutation,
   and reserves metadata resources. AppStore also checks assisted availability.
   Reviewed helper hash is recorded above; reviewed AppStore SHA-256 is
   `9B8DAEB9B5E36DA3A078933A51CC2E1A536840D8711777C6BE74823A1A033C43`.
8. **Accepted and fixed: inspect the complete object-routing graph.** The initial
   direct-alternates checks do not visit alternates owned by an external object
   store. An archived module A can borrow from outside store B, which in turn
   borrows from an ignored object-only directory C inside the selected checkout.
   B passes both lexical and physical direct-target checks, but cleanup deletes
   C and breaks the retained history. Environment object routing can have the
   same requirement. The existing
   `repository-operation.ts:getAssistedCommitProtectedResources` uses Git's
   `count-objects -v` to enumerate native recursive/environment routing and
   explicitly documents why direct `objects/info/alternates` parsing is
   insufficient. The revised source discovers the native alternate graph for
   retained initialized and inactive repositories and rejects every lexical or
   physical alternate in either deletion area. It additionally reads the native
   primary object directory and requires it to remain the retained Git
   directory's own `objects` directory, rejecting environment primary routing.
   Ambiguous quoted graph output and config-less inactive object stores fail
   closed. Source correction verified; independent fixture execution is pending
   QA.

The final source also records original submodule pointer-file text and module
identities in `restore.json`, making recovery mapping explicit. Directory
inventory identities now use device/inode/mode rather than timestamps: exact
child inventory still detects new contents, file/link identities still include
size/times, and nonrecursive `rmdir` still refuses newly added contents. This
adjustment avoids false drift from temporary Git files without widening the
set of deleted entries. Source assessment accepted.

## Independent assessment and limits

The design materially improves preservation: complete submodule Git directories
are retained before checkout deletion; missing-index empty checkouts are described
without guessing intent; initialized submodule dirty data and HEAD commits outside
the selected target block cleanup; working entries are inventoried without link
descent and deleted with per-entry checks plus nonrecursive directory removal.
Shared stashes and metadata are retained rather than inferred disposable from
parent-branch ancestry. Nested repositories and hidden index flags fail closed.

The documented limitation for an uncooperative writer between a path check and
its following operation is accurate. This review makes no claim of atomic or
adversarial race exclusion. The final forced Git operation follows an absent-root
check and link-free/module-free administrative inspection; callers must preserve
the documented partial-failure handling. Main-checkout dependency/junction-target
preservation, metadata recovery usability, and Git behavior need the separate
backend fixture evidence. No unresolved actionable source findings remain in the
final hashes above. Independent source assessment passes, subject to completion
of the separate backend fixture QA and its reported coverage limits. This is
not execution validation, approval to delete a user's checkout, or a release
receipt.

Review documentation was written only after cooperative sync status reported no
active lock and `clean: false`. No shared ledger was edited by this reviewer.
