# Protecting work: first implementation pass

Implemented on 30 October 2026. This pass covers replacement writes, conflict recovery,
workspace drafts, and incomplete PR reads. It does not complete the wider Git-client audit.

## 1. Native write ownership

Hunk actions pass the old and new text of the rendered diff through IPC. Working-file saves
and conflict resolutions pass the text they started from. Native code validates these
expectations under a repository operation guard; a stale request returns a structured
conflict with instructions to reload.

The guard uses the real common Git directory, so linked worktrees share it. Desktop Git
commands, staging, discard, commit, repository file creation/Trash, and PR workspace
preparation participate. A competing operation returns a recoverable busy failure.

Index replacement additionally owns Git's actual `index.lock`, edits an alternate index,
rechecks the source versions, and installs the resulting index. Unrelated staged entries
are retained. An existing external lock is never removed.

Working-file replacement writes a sibling temporary file, checks contents and file
identity again, then installs it. Creation of an absent file is exclusive. UTF-8 BOMs,
supplied line endings, and permission bits are retained in the tested cases. Symbolic
links, shared hard links, and unsupported file kinds are rejected.

There is no portable filesystem compare-and-swap for arbitrary external editors. An
external write in the final check-to-rename interval remains a limitation. ACLs, extended
attributes, custom Git filters, sparse indexes, and Windows behavior are not proven by
these tests. The native operation guard coordinates this app, not arbitrary external
processes.

## 2. Recovery and durable drafts

Conflict read and save failures use the shared error surfaces. A failed resolution keeps
its choice and preview; Retry applies it only against its original text. Reload keeps
the previous preview for comparison and requires a fresh choice if the file changed.

Pending local review annotations are saved with repository and revision context. Branch
review resolves mutable branch names to commit IDs before creating comments. Commit
messages already belonged to persisted workspace tabs; this pass strengthens their
storage and lifecycle rather than creating a second draft store.

Renderer saves go immediately to the native owner. Native writes are ordered across store
instances, use temporary-file replacement and fsync, and keep the previous valid document
as a backup. Malformed primary data is recovered from a valid backup and archived before
replacement. Without a usable backup, it produces an error and is not overwritten.

Startup read failures block workspace editing and offer Retry. Normal window close and
quit request a renderer flush; a failed save keeps the window open with recovery. This
does not guarantee saving work during forced termination. Unsubmitted comment composer
text and unsaved file-editor buffers are outside this persistence change.

## 3. Explicit and complete reads

Diff parser failures remain retryable failures and are not cached as absent diffs.
Changes and branch comparison retain loaded content with a refresh notice when another
read fails. PR overview and inbox errors expose retry; unknown file statistics are not
shown as zero, and incomplete checks are not summarized as passed.

GitHub overview file statistics and issue comments follow REST pagination. Review threads
and every thread's comments follow their GraphQL cursors. Dependent pages are sequential,
have a collection deadline, propagate supplied cancellation, and reject malformed or
repeated continuations. REST continuations must remain on the same GitHub resource.
GitHub's 3,000-file endpoint limit is checked against the PR total and produces an explicit
failure when incomplete. The PR diff browser still uses local Git comparison.

Existing check collection limits are surfaced, not fully paginated by this pass. There
is no new global provider rate-limit scheduler or renderer-to-IPC cancellation protocol.
No authenticated provider writes or live account fault injection were used for testing.

## Verification

- Real temporary Git repositories cover stale stage/unstage/discard/save, competing
  saves, external index locks, unrelated index entries, deletion/restoration, modes,
  BOM/CRLF bytes, and linked-worktree coordination.
- Actual Electron main/preload/renderer tests cover structured IPC errors, a burst of
  edits followed immediately by reload, comment and commit-message restoration after
  restart, startup recovery, and refusing normal close when persistence fails.
- Storage tests cover ordering across store instances, malformed/truncated data,
  backup recovery, and preservation of rejected data.
- Provider seam tests cover later REST pages, nested GraphQL pages, cancellation,
  malformed continuations, realistic reaction metadata, and the GitHub file cap.
- Browser tests exercise retained conflict previews, stale reload, Retry, PR refresh
  failures, and incomplete statuses in light and dark themes.

The broader browser run exposed an intermittent folder-navigation focus failure. Its
assertion was retained; it also passed on a focused rerun. It needs its own navigation
investigation if reproduced again.
