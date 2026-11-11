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

## Follow-up: committed repository fixture false positive

Accepted and fixed source finding from the user's screenshot:
`Nested bare repository prevents cleanup: app\test\fixtures\branch-prune-tests\_git`.
Read-only inspection confirms that outer Git tracks the fixture's HEAD, config,
index, refs, reflogs and object files as ordinary blobs. The shape-only detector
incorrectly equated this committed source data with independent nested Git state.

The bounded correction passes independent source review in the isolated worktree
at starting commit `297594d3c229620ef75c88cf0cd744e83a339214`. Reviewed SHA-256:

| Source | SHA-256 |
| --- | --- |
| `app/src/lib/git/worktree-branch-removal.ts` | `4CFE0CBAC16A239EA3EBB5820A12E85697A4F1101AB328ACF01E2A14D1709FEA` |
| `app/src/lib/git/worktree-cleanup-repository-data.ts` | `9B58571D4EF1E75E81A126690E14A4FDDD36EC89E798D5F53D1F6560FAA7986A` |

The exception proves the complete candidate subtree against the selected exact
commit. Only ordinary committed blobs are eligible. Stage-zero index modes and
object IDs must exactly match the committed tree; a separate diff checks local
drift. Every physical descendant must be an expected ordinary file or a required
parent directory, and every expected file must be present. Extra ignored or
untracked files, extra empty directories, links, gitlinks, special entries and
missing files fail closed. Raw physical file bytes are independently hashed as
Git blobs and must equal their committed IDs. The helper uses literal pathspecs
and NUL-delimited records; there is no path/name whitelist or cached approval.
Both nested metadata-directory and bare-shape checks use the same proof. Existing
global hidden-index, active-operation, snapshot and per-entry deletion guards
remain enforced.

No actionable source issue remains in this bounded fix. The stricter raw-byte
proof can conservatively reject checkout text/filter conversions; it does not
accept a misleading clean status as proof. Backend QA must independently verify
the real fixture and staged, dirty, extra-data and genuine nested-repository
variants. This reviewer performed no tests, actual cleanup or production edits.
See [the scoped implementation report](2026-11-11-tracked-repository-fixture-cleanup.md).

Before this documentation update, the normal sync status command failed closed
while reading protected submodule metadata. A direct successful enumeration of
its established state directory,
`D:/extcode/github-desktop/.git/codex-upstream-sync`, showed only the retained run
directory and no `lock`. No clean-status assertion is inferred from that failed
command, and no shared ledger was edited.

## Follow-up: unavailable submodule target commit

Accepted and fixed source finding from the screenshot reporting
`fatal: Not a valid commit name ebcf0afa6af624bf59c3d3b674b744b029835a1e`.
At isolated starting commit `cf2bdb187266d450ba7ffe91db172b845ce079c9`, both
the selected checkout and current main record that gitlink for
`app/static/common/gitignore`. The selected dedicated submodule store resolves
local HEAD as `8ba69a4220df77b696fe97b60fb70eb668fb00e1`, but cannot resolve
the selected target commit. It reports not shallow. This establishes unavailable
local object data, not that ancestry is safe or that upstream lacks the commit.

Independent source review passes the bounded change to
`app/src/lib/git/worktree-removal-submodules.ts`, SHA-256
`C255831A96EBC5267CF1B2F651355252100DAD8CE765ADF4233B8742CC24F60A`.
Quiet local HEAD/target commit verification handles only expected exit 1 as
unavailability; other operational failures propagate rather than being
mislabeled missing. Typed issues carry module path and required revision, and
their messages are also ordinary removal blockers consumed by the existing
preview. Missing HEAD/target, unproven ancestry and history/access failures all
remain blocked. Ancestry exit 1 does not assert definitively unique commits;
exit 128 has a separate history-failure explanation. HEAD-dependent status/diff
and recursive target-tree reads are gated on local commit availability. No
uninspected descendant state is authorized for removal when a parent is blocked.

The revised local read helper, direct revision checks and ancestry comparison
set `GIT_NO_LAZY_FETCH=1` and `GIT_OPTIONAL_LOCKS=0`. There is no recovery,
fetch, reset or hydration path in the fix. Source assessment has no unresolved
actionable finding; backend QA must independently validate classifications,
no implicit fetching, removal refusal and normal available ancestry behavior.

Reviewer diagnosis was local and read-only. Initial diagnostic commands did not
explicitly set command-local no-lazy-fetch flags; no fetch command was issued
or observed. A later read of the selected store's local configuration found no
partial-clone/promisor keys. This statement is separate from the verified flags
in the revised source. No cleanup, fetch/repair, tests, dependency changes or
production edits were performed by this reviewer. See the
[scoped implementation report](2026-11-11-unavailable-submodule-commit-cleanup.md).

Before this documentation update, normal local-access sync status returned
`clean: false` with no active lock. No shared ledger was edited.

## Follow-up: registered submodule root junction

Accepted and fixed: an exact registered gitlink entry represented by a junction
was rejected as a nonordinary submodule directory before the existing link-only
inventory and deletion path could handle it. Independent source assessment
passes the frozen snapshot at `cf2bdb187266d450ba7ffe91db172b845ce079c9`:

| Source | SHA-256 |
| --- | --- |
| `app/src/lib/git/worktree-removal-submodules.ts` | `454EA59F0B3A970AFE9B905CD699BA177EA2BCA42F5A02E82DCE1AE02DD0268C` |
| `app/src/ui/branches/unmerged-branches-dialog.tsx` | `AE3CAC3E61D59BE6F5E20DF047F5C58871B8517E4DE170E068064B2E74F93D66` |

The exception applies only to the exact indexed gitlink root. Its parent and all
ancestors must pass ordinary-directory proof before existence or link
classification. The selected target must still contain the gitlink. A link is
recorded with explicit `linked` state, readlink target and null HEAD/Git directory,
then immediately skipped: no target `.git` read, Git command in the linked root,
or recursive target visit occurs. The null Git directory excludes the target
from retention paths and short-circuits recovery pointer reads. Existing
worktree-owned inactive metadata remains subject to ownership, link and object
routing checks before archival.

The unchanged full file inventory records link identity and readlink text
without descent. Action-time repeated snapshots reject replacement, and the
unchanged removal helper checks ordinary parents before unlinking that entry.
Root and ancestor junctions remain rejected. The committed-repository-data proof,
metadata ownership/alternate guards, branch compare-and-delete and partial-error
handling are unchanged. Reviewed helper hashes still match their previously
accepted values above. Existing dirty local-history diagnostics were preserved
as the baseline, rather than replaced by this correction.

Accepted and fixed copy finding: saying every linked target is preserved
overclaims behavior when a target is itself independently inside the selected
cleanup tree. The backend does not follow the link, but ordinary independently
inventoried target files could still be removed. The final dialog now describes
link-only removal and no link traversal or target archival through the link;
the linked row shows its target without promising universal preservation.
The ignored-links paragraph uses the same accurate wording. This correction
requires no target read or resolution. The external main-checkout case remains
protected by the no-traversal design.

This is source review only; no UI/browser/manual tests were performed.
Independent backend QA separately covers real junction cleanup,
dirty target and dependency/metadata preservation, no Git calls at target paths,
stale junction replacement and the existing preservation regressions. QA reported
41/41 backend tests passing against the unchanged helper and the earlier UI hash
`4B4E754BCF165E7B582039C2A00656510F1C648E19398480381FD3AB42537E3D`.
The final UI-only copy change was independently source-reviewed after the safe
QA boundary; no backend source changed, so it does not invalidate backend
evidence or establish UI execution coverage. No unresolved actionable source
issue remains in this bounded correction. This review authorizes no actual
user checkout deletion, commit, integration, build, launch or push.

The previously documented path-based concurrent-writer limitation remains.
Normal restricted sync status failed while reading protected existing submodule
metadata; direct enumeration of the established sync state directory showed no
`lock` immediately before this documentation append. This reviewer changed only
this report and ran no tests or production mutations. See the
[scoped implementation report](2026-11-11-submodule-root-junction-cleanup.md).

Commit scope: the junction correction is isolated from the pre-existing local-history diagnostic changes and their four regressions. The accepted 41-test run exercised the combined dirty snapshot; the scoped commit reuses that evidence for unchanged junction behavior and is not an execution receipt for its exact tree. The linked branch omits only the unrelated issues property when extracted onto HEAD. Three junction tests and shared test helpers are included; baseline local-history code/tests/review and a later unknown-owner second ancestor-check argument remain unstaged. UI runtime coverage remains excluded.
