# Preserved-history cleanup policy source review

## Scope and ownership

Independent source review of the approved unavailable/differing submodule-history
preservation and root `.safe_to_remove` policy in
`D:/code/git-desktop/.worktrees/submodule-junction-cleanup`, branch
`codex/submodule-junction-cleanup`, starting HEAD
`5f0b95f7c27311bf19be540712d54d3a40094184`.

Reviewer owns only this report. Production implementation and backend QA have
separate owners. No tests, build, commit, actual user cleanup, repair, fetch,
object-copy operation, launch, integration, push or server access is performed by
this review. Unrelated `script/build.ts` and static-resource work is preserved.

The cooperative sync runner cannot report status through existing protected
submodule metadata. Direct inspection of its established common-Git state
directory found no `lock` before this documentation edit. Top-level source status
was inspected with submodules ignored; that does not certify submodule contents.

## Baseline findings and required dispositions

These are acceptance requirements for the approved policy change, rather than
claims that the previous conservative policy violated its own contract.

| ID | Assessment and disposition | Required source evidence |
| --- | --- | --- |
| P1 | Accepted/actionable: retaining a private Git directory while relying on external alternate stores is insufficient for a complete private backup. | Reject unsupported routing or retain and verify every required local object store, including reflog/stash/unreachable data; do not infer completeness from parent gitlinks or reachable commits alone. |
| P2 | Accepted/actionable: history differences may be informational only after preservation is proven. | Unavailable target and unmerged module history must not hide modified/staged files, nested modules, invalid ownership, missing HEAD data, unsupported object routing or archive failures. |
| P3 | Accepted/actionable: metadata outside the selected worktree inventory needs independent action-time verification. | Snapshot private metadata, detect stale files, and verify the retained archive before deleting checkout files. Describe partial failures with a recovery location. |
| P4 | Accepted/actionable: policy consent is limited to explicit untracked/ignored matches. | Root gitignore-style comments/negation, directory and subtree behavior; no tracked-path or Git-metadata override; unmatched ignored files retain separate explicit consent. |
| P5 | Accepted/actionable: policy processing must respect the existing no-follow boundary. | Prove ordinary ancestors before reads, do not enter linked submodule targets or directory links, and revalidate policy/content before mutation. |

## Frozen source assessment

Independently read and verified all ten hashes in
`tmp/preserved-cleanup-policy/production-manifest.json` at the starting HEAD.

| Source | SHA-256 |
| --- | --- |
| `worktree-branch-removal.ts` | `db797d60bf1243c4004c67509bc12c5f97ff16e72ddd1b259af8c1a7878a8ba7` |
| `worktree-removal-submodules.ts` | `8d2e09008abcc993fb5697a9a33d09c4898aabe9ebf21ddab6abcdde6d298b14` |
| `worktree-disposable-files.ts` | `0849b80b99ca43a4426908e6ed83cbb153f86433c121a76cf36fd84e70ee553c` |
| `worktree-metadata-backup.ts` | `24dae55a06fe4c25f3ec4cc05c688bf0406122e6f328a12c106bfad2729c63cf` |
| `unmerged-branches-dialog.tsx` | `d92f6b1a897dd0b022cce582ce2efd096ea7c48958e308df2374c28f28aa1680` |
| `docs/technical/worktree-removal.md` | `7bdc5960b3bba263e16b8ee25b5e8e13c54e7e25929d74bf4252835876b922df` |

**P1 accepted/fixed in source.** All external/transitive alternates are rejected,
including stderr routing diagnostics and nonempty on-disk alternates or
http-alternates. Primary object routing must remain the private `objects` path.
Local history passes full Git integrity checking with replacement objects
disabled. Shallow/partial-clone stores, external configuration includes,
per-worktree configuration and legacy graft files are rejected. The complete
private container is inventoried and SHA-256 fingerprinted, including inactive
modules, indexes, local refs, stashes, reflogs, packs, loose and unreachable
objects. Retaining all bytes does not synthesize unavailable target history.

Reviewer hardening suggestions to reject legacy grafts and `config.worktree`
were accepted and are present in this frozen source. Their conservative refusal
is justified because these routes complicate complete independent retention;
the reviewer did not execute a demonstrated corruption exploit.

**P2 accepted/fixed in source.** Target-unavailable, differing ancestry and target
comparison failures become displayed notices. Missing local HEAD remains a
blocker. Staged/modified data, hidden index flags and active operations retain
their guards. Recursive traversal continues from current indexed nested gitlinks
even when a target revision is unavailable. Ownership, nested-repository and
integrity checks remain authoritative in the backend.

**P3 accepted/fixed in source.** Metadata manifests are part of repeated consent
snapshots. Every private container is checked immediately before rename and
verified byte-for-byte at the saved path before checkout deletion. Recovery JSON
records original/saved mappings, checkout pointers and manifests; a README
explains inspection/restoration. Failures retain the branch and report the
archive location. Existing compare-and-delete of the branch and operation scopes
remain in place.

**P4 accepted/fixed in source.** The pinned runtime `ignore` matcher implements
case-sensitive Git-ignore syntax, comments, anchoring and negation. Directory
candidates are expanded to file/link/empty-directory leaves; matching the parent
does not hide a remaining protected leaf. Only Git-classified untracked/ignored
paths enter matching. Tracked edits and staged gitlink changes cannot be waived.
Git metadata segments and nested repositories retain separate guards. Root
unmatched ignored files retain explicit default-false checkbox consent; unmatched
ignored files in ordinary submodules retain their baseline blocker. This scope
is now explicit in the technical documentation.

**P5 accepted/fixed in source.** Root policy reads require ordinary ancestors and
an ordinary bounded-size file; handle identity and before/after lstat detect
replacement. Nested policies are not read. Matching inventories directory links
as leaves and never enters their targets. Exact registered linked submodule
roots remain skipped before target Git/policy inspection. Repeated policy and
file-inventory snapshots plus the unchanged checked unlink/rmdir helper preserve
the no-follow deletion boundary.

## Final finding and disposition

**P6 accepted/fixed in source:** the implementation owner
identified that `GIT_GRAFT_FILE` is absent from the forbidden environment-routing
list. An externally selected graft file is outside retained metadata and is not
covered by the default `info/grafts` check. Reject this unsupported route rather
than assuming that the private archive reproduces its semantics. No demonstrated
fsck bypass is claimed. The owner preserved the active QA freeze, then added the
environment guard at its safe boundary. Independently re-read the guard and
reverified all ten production-manifest entries. The owning helper now has SHA-256
`db797d60bf1243c4004c67509bc12c5f97ff16e72ddd1b259af8c1a7878a8ba7`,
superseding initial frozen `f59e1b8bb941e7f8287c91092ece35405db18b516864a2a928df0b164d958383`.
All other reviewed hashes are unchanged. QA is separately executing the revised
complete backend batch with a regression for this route.

**Final independent source disposition:** P1-P6 accepted and resolved in source;
no unresolved actionable source issue remains in the approved bounded change.
This is source acceptance, contingent on separately owned backend acceptance
before task completion. The first restricted QA attempt encountered fixture
creation/access setup failures; it does not establish complete backend acceptance
and is not represented as a behavior failure. Refer to the QA receipt for the
definitive result and exact tested source identity.

## QA follow-up source gate

**P7 accepted/fixed in source:** independent QA found that
Git can report an untracked junction's descendants rather than the junction
entry. The policy partitioner then correctly rejects the linked parent as an
ordinary directory, preventing an explicitly approved whole-link cleanup. The
parent authorized a narrow normalization fix: map reported descendants to a
verified link ancestor without inspecting its target or the reported suffix,
then match policy against the complete link path. A rule for a
target child alone must not authorize deleting the whole link. Existing action
inventory and identity checks must still reject link/ancestor replacement.

Independently reviewed final helper
`0849b80b99ca43a4426908e6ed83cbb153f86433c121a76cf36fd84e70ee553c`
and reverified all ten production-manifest hashes. Only this helper changed from
the preceding review snapshot. The implementation establishes containment inside
both the repository and selected root, proves ordinary repository ancestors,
and walks lexical path components with lstat. It stops at the first link before
any suffix lstat or recursive inventory. Matching and display use only the
collapsed complete link path. Links remain single leaves; ordinary directories
still receive complete no-follow leaf inventories. The existing full worktree
inventory records link identity/readlink text for repeated consent snapshots and
checked unlink. A replacement ancestor must again pass ordinary-directory proof,
and replacement of an inventoried link invalidates action-time consent.

The reviewed new backend regression asserts that a rule matching only
`/disposable-link/sentinel` leaves the junction blocked and its external target
unchanged. Its execution is owned by QA. No source defect remains in this bounded
correction; P1-P7 are source-accepted. The final independent source disposition
supersedes the prior pending P7 gate, while complete backend acceptance remains
separate and must identify this exact final helper hash.

**P8 informational/deferred:** the new exact `fsck --full --no-dangling` command is
not classified read-only by `repository-operation.ts`, so conservative mutation
admission may block a preview overlapping assisted work. Actual UI preview calls
the checker directly, outside read-only reconciliation, and this classification
does not grant additional writes. No deletion-safety defect is established.
Changing the shared classifier is outside the approved normalization fix; any
future adjustment should recognize an explicitly bounded argument set and keep
`fsck --lost-found` classified as mutation. No broad fsck whitelist is proposed.

## Verification limits

This assessment is source-only. Backend execution is separately owned; no UI,
browser, manual or packaged-application acceptance is claimed. Installed
dependency/bundling checks are not a built-package receipt. Path-based lstat,
open and rename checks reduce accidental drift but are not an atomic transaction
against hostile external writers. The technical documentation states that limit.
No actual user worktree deletion is authorized by this report.
