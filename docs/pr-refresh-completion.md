# Phase two: PR refresh completion

This completes the remaining PR-refresh paths on top of `c605771`. Repository watchers,
write coordination and file-tree navigation retain their existing owners.

## Ownership and reads

`PullRequestRefreshController` reference-counts the resources required by mounted views.
Refresh uses their union, rather than every query that happens to remain in the cache.
Conversation is read first. Provider auxiliary reads run in batches of three. The controller
coalesces overlapping requests, owns focus/reconnect recovery and automatic backoff, and
releases timers when its last view closes. Its provider receives the refresh operation at
application composition; mounting a control does not initialize a separate store.

Overview, Files, Commits, local review and Guidance use the existing compact PR action.
The selected inbox preview refreshes through the same owner, then invalidates the mounted
inbox listing once. Comment/review/reviewer mutations invalidate the relevant listing and
activity data as well as their detail reads. GitHub extras no longer add a second Refresh.
Refresh keeps keyboard focus while busy and ignores repeated activation.

The owner awaits demanded local comparison reads and reuses immutable cached results.
A failed aggregate file read, commit list, commit group or selected commit file read can
recover from the shared action without requiring a new PR head. Automatic recovery also
retries failed prepared refs when the revision is unchanged.

Provider deadlines live in renderer Redux state independently of query-cache eviction.
Other readers and repositories with the same resolved provider respect the longest deadline.
Authentication, permission, invalid-input and not-found failures pause automatic refresh;
manual recovery is allowed once the provider deadline has passed. Existing content remains
visible with recovery, and background refresh does not emit repeated error toasts.

## Revision handoff

Native prepared refs now include the fetched base branch tip separately from the merge base.
Both head and base must match the current PR detail. A base-only update therefore participates
in handoff just like a force-push.

The comparison hook retains one complete refs/files/conversation snapshot, including commit
lists and groups when demanded. Replacement becomes visible only when all required parts
are ready. Overview inline review cards, local review and Guidance share this hook. New
threads and viewed markers are not applied to a stale comparison. Checks and provider file
statistics carry the revision at which their reads began; Overview and inbox hide mismatched
results rather than labeling them current. Provider reads remain separate remote requests,
not a transactional snapshot of the host.

The previous revision remains usable with a compact notice while the replacement loads.
Review submission and pending-comment publication pause during that handoff. The command
composer also checks its own prepared head/base before allowing submission. Saved drafts
are not deleted or reanchored by refresh. Background handoff preserves an open review message
and its editor focus. Guidance whose references target an obsolete head still requires the
agent to regenerate the walkthrough; refresh does not invent new anchors.

The native main process must be rebuilt/restarted with the renderer to provide the new base-tip
field. No compatibility fallback to the merge base was added.

## Verification

New controller/provider-seam tests use a real RTK store and deterministic desktop replies.
They cover mounted demand, overlapping requests, releases/disposal, revision guards, cached
and cross-reader failures, provider deadlines after cache disposal and across repositories,
base-only metadata, mutation-driven inbox/activity updates and unchanged-head recovery.

Browser checks exercise Bitbucket and GitHub, light/dark themes, wide/narrow layouts, initial
and retained failures, compact Refresh actions, keyboard activation, repeated commit paths,
base-only updates, force-pushes, renamed/deleted selection targets, tree identity, local review,
Guidance and an open review-message draft during background handoff. Deliberately pending
reads use explicit release signals; no sleeps or retry settings were added to hide failures.
The revision notice has Storybook states and was rendered in both themes.

The full unit suite passed 481 tests across 95 files. The final prepared-ref reconciliation
follow-up passed all 16 focused controller/provider checks. The PR/Guidance browser run passed
36 checks; subsequent handoff refinements passed nine focused checks, and the typed local-error
follow-up passed both local-review themes. Desktop, Electron and Storybook typechecks passed.
Changed-file lint and formatting passed with no warnings; Storybook built successfully.

Screenshots are in `/tmp/warden-pr-refresh-visual`; these are local QA artifacts, not durable
project assets.

## Limits

Started IPC reads can finish after a view closes; the transport has no request cancellation.
The result stays keyed to its original PR and no closed view schedules another poll. Retry
deadlines survive cache disposal during the renderer session, not application restarts.

This work uses deterministic provider fixtures and temporary Git/native tests. It did not post
live comments/reviews, merge PRs or inject failures into a user's provider account. It does
not establish Windows/Linux UI or native latency guarantees. Previously documented inbox
pane-resize intermittency is separate from PR revision and tree navigation behavior.
