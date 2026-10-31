# Stable asynchronous layouts

Independent query/render boundaries remain in place. Stable dimensions and publication boundaries
now prevent content arriving later from repeatedly moving the workspace.

## Media and lists

`MarkdownImage` reserves the frame before requesting/decoding media. Explicit width and height
supply its aspect ratio; unknown dimensions use a 16:9 preview bounded to 480px high. The image
fits inside that frame, and its lightbox keeps the full image available. Loading and failure
occupy the same frame. A failure links to the original source, including for authenticated
provider media. Changing the source starts a new preview lifecycle.
Activating an image preview prevents the enclosing Markdown link's default navigation, so a
linked attachment opens the lightbox without also opening a download URL. Pointer and keyboard
activation use the same path.

`CommitRow` and its loading placeholders share a 46px height with `VirtualCommitRows`.
Virtualization no longer measures a different row size after mounting. Retained errors and
selection notices float over the commit pane instead of shrinking its viewport. Initial empty,
loading and error states remain inside that same scroll owner.
When fetched history inserts commits above the viewport, the list retains the visible commit's
identity and row offset. Explicit filtering or navigation to another commit remains intentional
navigation and does not restore an old reading anchor.

## PR composition

The status header retains the compact, naturally grouped row. It wraps with available width
rather than distributing statuses across equal-width columns. The overview keeps a stable
scrollbar gutter. Refresh errors and stale-revision notices occupy
positioned regions, so they do not resize the header, trees or diff panes. They remain readable,
keyboard reachable and retryable.

The description renders as soon as its conversation read is available, independently of slower
activity and Git comparison reads. Initial activity and the bottom comment composer appear once
those reads settle; no conversation-wide spinner hides already available text. After the first
publication, the timeline retains its conversation/activity/comparison snapshot while refresh
is incomplete or fails. An initial
partial failure can still show the available conversation with recovery. The existing shared
PR controller continues to own requests, deadlines and polling; there is no new pane-local poll.
The GitHub-only extras reader mounts only for GitHub.

A timeline scroll owner records the visible item and its viewport offset, preferring the focused
composer when visible. Layout updates and content resizing restore that offset while the item
survives. This changes scroll position without moving keyboard focus. Switching PR identities
mounts a separate timeline; refreshing one PR retains its composer. Expanded markdown also keeps
the user's expansion choice when its body updates.
The Overview description starts expanded; its Show less control can still collapse it.
Ordinary comment bodies retain their compact default.

## Verification and limits

Delayed media tests compare the frame and following content before and after decode/failure.
Delayed native replies verify that the description is readable while activity and prepared Git
refs are pending, and that the composer arrives last. Header checks verify compact spacing.
Linked image tests exercise mouse/keyboard activation and gallery navigation, checking cancelled
link activation, zero download requests and zero popups. Background activity
insertion preserves a visible reading anchor, comment text and editor focus. Commit tests cover
fixed heights with selection, filtering and more than 1,000 virtualized commits. These checks
run in light/dark themes at narrow and wide desktop widths.

The earlier broad PR/History/Guidance browser run passed 67 checks. Follow-up checks cover supplied
portrait dimensions, fixed pane bounds during refresh errors, and prepended history while
retaining the visible commit. All five History navigation/anchor follow-ups passed. The focused unit run passed
43 checks. Desktop/Electron/Storybook typechecks, changed-file lint and formatting pass; the
Storybook build and rendered media/notice/commit states are part of visual review. The compact
header/description-first follow-up passed all 45 PR browser checks and 40 focused unit checks,
plus delayed-Git follow-ups in both themes. Its Overview and linked-image stories were built
and rendered at narrow/wide widths in both themes.

Measurements use deterministic provider/media fixtures, not a live account or performance
benchmark. Content intentionally expanded/collapsed or changed by its author can still change
height. If the currently anchored item is removed, the reader remains at the surviving viewport
rather than following an unrelated item. Screenshots in `/tmp/warden-layout-visual` are local QA
artifacts, not committed assets.
