# Phase two: freshness and file-tree ownership

Implemented on top of the first-pass write coordination, stale-write guards, draft durability,
and retained-read recovery. No persistence or write-protection checks were removed.

## Repository freshness

`electron/repositoryEvents.ts` owns native subscriptions for repositories in open workspaces.
The existing write coordinator requires an explicit event from the central native definitions in
`electron/repositoryChangeDefinitions.ts` and publishes completion hints even when an operation
fails partway through. Refresh effects never depend on matching diagnostic operation names. Native saves supply their affected path; Git commands distinguish ref-only
operations such as fetch from worktree operations. Filesystem notifications are hints: query
readers still ask Git and the filesystem for authoritative state.

Worktree watchers use recursive native root subscriptions through `@parcel/watcher`. The shared
watch pool reuses identical roots and common Git metadata across linked worktrees. Git supplies
ignored paths so dependency/build trees are excluded; force-tracked files inside ignored directories
remain observable. Shared nonrecursive parent watches detect repository root replacement. There
is no repository-count cap and no per-directory Node watch registration.
Metadata watchers distinguish the per-worktree Git directory from its shared common directory.
Linked worktree index changes stay local; shared refs reach both repositories. Metadata classification
uses explicit directory scopes and filename definitions, so refs named `index` or `config` remain
ref changes. The writer and watcher share the application's temporary-file naming definition. Temporary save
files, lock files, object/log writes and commit-message typing do not refresh all panes.

Events coalesce for 160 ms with an 800 ms burst deadline. Broad hints remain broad when mixed
with path-specific hints. Structural/index/config changes reconcile membership, ignored paths and replaced root inode
subscriptions. Ref-only changes do not rescan worktree membership. Reconciliation uses the same native file-list reader as the Files pane and publishes
membership changes it discovers; a rescan cannot silently absorb a new file before its delayed
filesystem hint arrives. Failed subscriptions report recovery, retry, and recover on focus/reconnect. Closing
a repository, renderer or app disposes its subscriptions. Healthy repositories have no polling
loop.

`RepositoryFreshnessBootstrap` maps these events to repository-scoped query families. Ordinary
edits refresh the snapshot and affected working content. Structure/index changes refresh file
membership. Ref changes refresh history, branch/status data and comparisons. Native mutations
use this owner; browser-only adapters keep their existing invalidation fallback. Explicit
repository refresh also refreshes cached commit details/files/diffs within that repository.

## File-tree navigation

Post-stage, unstage, discard, deletion and filtering use the renderer's prepared projection.
Selection follows the next visible surviving file, then the preceding one at the boundary.
Bucket identity and live collapsed directories participate. An unsuccessful mutation does not optimistically advance selection; actual partial removals are
reconciled by the same model. Completion does not replace a newer selection or another workspace's selection.
The duplicate optimistic keyboard-stage advance and provider-array range fallback were removed.

The intermittent folder-focus failure was reproduced: a delayed initial-scroll frame focused
the selected file after the user had already moved keyboard focus to its folder. Initial scroll
now yields to newer model focus. The original assertion passed three consecutive runs without
sleeps, retries or relaxed assertions.

The project rule is documented in `.agents/skills/open-warden-file-trees/SKILL.md` and referenced
from `AGENTS.md`. Active selection remains below grouping, projection, lookup and status work.
No React memoization was added.

## Pull request refresh

The inbox and PR review views expose a compact refresh action. One demand-owned controller per
repository/PR coordinates conversation, checks, reviewers, file statistics, activity, viewed
state, extras and prepared comparison refs already used by that PR. It deduplicates overlapping
requests and limits auxiliary reads to batches of three. A changed head/base revision refreshes
prepared refs. Initial query loading remains with RTK Query.

The mounted comparison retains its last complete refs/file-list pair during revision handoff.
The new pair appears when ready, preserving the tree instance and current file when it survives.
Commenting pauses while the displayed revision is stale. Refresh errors retain content and offer
Retry; initial read failures retain their existing recovery surfaces.

Automatic refresh runs every minute while a view owns the PR. Transient failures back off up to
15 minutes; focus/reconnect respects that backoff. Authentication, permission, invalid-input and
not-found failures pause automatic retries. Provider retry deadlines apply to manual refresh
and independently mounted query readers, too. Explicit retry can recover a transient/permanent
failure once any provider deadline has passed. Unmounting the last view cancels its timer.
Already-started IPC reads may finish; the IPC transport does not provide request cancellation.

The ownership/lifetime, local-versus-remote refresh and error policy were informed by read-only
inspection of T3 Code's `apps/server/src/vcs/VcsStatusBroadcaster.ts`. Open Warden keeps its own
Electron/Redux architecture. Hosted work is scoped to Bitbucket and GitHub.

## Verification and limits

Native tests use temporary Git repositories. They exercise external edits, atomic saves,
create/delete, ignored output, ignore-rule changes, linked worktree index/ref behavior, root
replacement/recovery, partial failures and disposal. An Electron IPC test verifies automatic
Files/History updates while retaining tree identity and selection.

The real branch comparison was profiled read-only with 5,899 changed files, including a deep
Maestro YAML path. All 20 J/K events were delivered without repeats and returned to the original
selection. Key-to-two-animation-frame measurements were 32–48 ms in that run. This includes frame
waiting and automation overhead; it is not a general latency guarantee or a memory benchmark.
The CPU profile is saved in `/tmp/warden-phase2-real-tree`.

Focused browser coverage includes both themes, narrow/wide PR layouts, stage failure/success,
collapsed groups, tree refresh, Trash selection, hover/focus, history recovery, changed PR heads,
inbox refresh and rate limits. The guidance fixture now uses the first-pass session-result
contract and current Cmd+B sidebar shortcut.

Filesystem integration was exercised on macOS. Linux/Windows and network filesystems still need
native runs. The previous directory-per-watch strategy was replaced after a reported `EMFILE`
exception. Native recursive subscriptions avoid directory-sized Node handle growth on macOS. Focus
and explicit refresh remain recovery mechanisms for missed operating-system notifications. Provider request
behavior is exercised through the desktop boundary with deterministic fixtures; this work did
not mutate a user's repository or publish live provider changes.

Final checks: the full unit suite passed 463 tests across 93 files with two workers. Subsequent
watcher/backoff refinements passed their 11 focused tests. Desktop, Electron and Storybook
typechecks passed, and Storybook built and rendered its three new refresh states in both themes.
The combined browser run passed 82 of 83 checks. Its remaining inbox keyboard-resize check
occasionally reached the fully expanded list boundary after pane toggles; it passed all six
isolated repetitions without assertion changes. This intermittent resize behavior is not claimed
fixed by this phase. An earlier unit run alongside browser checks timed out in an existing real
Git fetch test; the bounded-concurrency full rerun passed without changing timeouts.

The explicit-event follow-up passed the 37 native command/write/watcher checks, then all eight
watcher regressions after the reconciliation correction. The final Electron refresh check passed
three consecutive runs with its original timing and UI assertions. This validation exposed and
corrected the race where reconciliation could absorb a new path before its filesystem hint was
classified. Diagnostic event capture remains available on native test failures.

## Native watcher resource correction

The reported exception was `EMFILE: too many open files, watch`. The exact original watcher
could not be identified from the supplied stack, and the old backend did not reproduce the
exception deterministically. The per-directory Node registration strategy was replaced rather
than adding repository limits or disabling background freshness. `@parcel/watcher` supplies
native recursive/batched events; the pool shares common Git roots and parent handles. Settings
watching now owns asynchronous watch errors and startup rejection, too.

A native Electron test opened 24 independent repositories plus eight linked worktrees, each with
128 nested package trees, under `ulimit -n 256`. External edits reached the first, middle and last
repository, including inactive workspaces. The process had two Node `FSEventWrap` resources
(settings and shared parent watching); this is not a count of the native package's recursive
streams. No watch failures or uncaught main-process exceptions were observed. The test waits for
the initial recovery batch before asserting path-specific steady-state delivery.

The real `/Users/timi/proj/onefor_apps_mono_2` repository opened read-only through the new backend,
including under the 256-descriptor limit.
The Electron refresh test verified Files/History updates while retaining tree identity and
selection. Pool tests cover shared leases, ignored subtrees and failed acquisition recovery;
Git tests include force-tracked files in ignored directories and reopening during release.
Electron-builder included the platform watcher binary outside ASAR, and packaged main/renderer
resources opened the real repository under Electron with an isolated temporary profile.
These runs establish macOS behavior; Linux/Windows remain unverified.

After this correction, the full unit suite passed 470 tests across 94 files with two workers.
Desktop/Electron/Storybook typechecks, focused lint, formatting and whitespace checks passed.
The macOS directory build completed; signing succeeded and notarization was skipped because
notarization credentials were not configured. The packaged-resource smoke check used isolated
user data and did not install or launch over the user's running app.
