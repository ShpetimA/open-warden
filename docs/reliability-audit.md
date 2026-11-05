# Desktop reliability audit — 2026-11-01

Scope: HEAD `f63d8da` plus the current uncommitted desktop changes. Three independent reviews covered renderer/UI, PR/provider workflows, and native Git/filesystem services. The implementation remains uncommitted. Existing packaging and visual work was preserved.

This is a targeted crash, freeze, resource, and work-loss review. It does not establish that every app path is safe or that the app can never crash.

## Findings and changes

| Finding                                                                 | Evidence                                                                                   | Status and owner                                                                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foreground diff jobs repeatedly cancel and retry each other             | Real PR #26236 froze; a concurrent-worker regression reproduced the cancellation           | Fixed before this audit: equal-priority jobs queue normally                                                                                                                    |
| LSP output pipe errors escape into the main process                     | A broken output stream raised an unhandled `EPIPE`                                         | Fixed in `electron/lsp/protocol.ts`: both stream directions report failure once; late shutdown errors remain contained                                                         |
| Malformed LSP lengths can stop parser progress                          | A negative Content-Length caused an endless loop in an isolated process                    | Fixed: strict positive bounded lengths, bounded headers/buffering, parsed messages, stop after failure                                                                         |
| Renderer failure blocks normal close                                    | A deliberately crashed isolated packaged renderer could not close after its save deadline  | Fixed in `electron/main.ts` and `rendererRecovery.ts`: explicit reload/close recovery and no wait for a dead renderer; in-flight native writes still flush                     |
| Markdown highlight results accumulate for the process lifetime          | Global code/HTML promise cache had no eviction                                             | Fixed: 128-entry / 16 MiB estimated cache budget; mounted blocks own their promise independently of eviction                                                                   |
| Provider API calls can remain busy without an application deadline      | Common GitHub/Bitbucket adapters lacked consistent deadlines                               | Fixed in `electron/providerRequest.ts`: 60-second header/body deadline composed with caller cancellation; no automatic write replay; uncertain writes tell the user to refresh |
| Bitbucket checks pagination can forward credentials to a foreign origin | A loopback fixture received a fixture Authorization header through the raw `next` URL path | Fixed: common Bitbucket API adapter rejects foreign origins, non-API paths, and URL credentials before issuing a request                                                       |
| Discard treats a concrete filename as a wildcard                        | Discarding `file[1].txt` also restored edited `file1.txt` in a real temp repository        | Fixed: literal pathspecs in discard status/restore/removal paths                                                                                                               |
| A stale untracked-file selection can recursively remove new work        | A selected file replaced by a directory lost its newly created child                       | Fixed: current untracked membership check and guarded nonrecursive unlink; staged replacements are preserved                                                                   |
| Normal quit loses dirty file editor buffers                             | Packaged app quit succeeded while omitting the unsaved text from its workspace store       | Fixed: dirty text and original baseline persist through the existing atomic workspace owner; external changes still cause a save conflict                                      |
| Overview comment drafts disappear on route switches                     | Composer text lived only in the mounted component                                          | Fixed: repo/PR-keyed Redux leaf and atomic persistence; route remount preserves text and active-post state; restart never replays a post                                       |
| Publication deletes edits made while an older draft is in flight        | Completing the older publication removed the updated draft ID                              | Fixed: only acknowledge the text that was actually sent; later edits remain in inline Publish, Finish Review, replies, and overview comments                                   |
| A successful reply appears to fail if its following refresh fails       | Native reply command required a full conversation read after its acknowledged POST         | Fixed: command acknowledges the write; query invalidation owns the separate refresh                                                                                            |
| Standalone GitHub review has a partial-success window across two writes | Pending review creation was followed by a separate submission request                      | Fixed: one supported POST with `event: COMMENT` and comments; only successful publication acknowledges draft IDs                                                               |
| Large/failed overview snippets show loading indefinitely                | A large gate schedules no parse; the component also ignored parse errors                   | Fixed: explicit Load snippet, error/Retry, and a stable missing-lines notice                                                                                                   |

Provider API deadlines cover headers and response bodies for reads and writes. Streaming provider media remains a separate lifecycle. There is still no renderer-to-main IPC request cancellation protocol. A lost response after a provider mutation can remain ambiguous; the app must refresh before the user retries it.

## Remaining findings

### Eager overview snippet work

`PullRequestTimeline` mounts all entries. Each `PullRequestOverviewAnchorCard` immediately loads complete old/new contents, including offscreen paths. Mounted parsed state retains completed full-file diffs, independently of the shared LRU.

Evidence: confirmed caller fanout and ownership. No production OOM was induced. The cache bound added here does not bound these live component references.

Next work: bound native file-read concurrency, start snippet work near the viewport, and release offscreen parsed state while preserving scroll and draft/focus ownership. This needs its own large-conversation rendered tests.

### Wide history graph memory growth

`historyGraph.ts` materializes each active continuation lane on every row, synchronously on the renderer thread. Row virtualization does not bound preparation or retained edges.

An isolated synthetic valid DAG measured approximately:

| Commits | Parallel branches | Prepared edges | Heap observed |
| ------: | ----------------: | -------------: | ------------: |
|     501 |               250 |         63,250 |        12 MiB |
|   1,001 |               500 |        251,500 |        31 MiB |
|   2,001 |             1,000 |      1,003,000 |        75 MiB |

Evidence: reproduced growth, not an application crash. Next work: sparse/range continuation representation and worker-owned preparation, retaining ancestry and navigation semantics.

## Verification

- The pre-change suite passed 562 tests across 112 files, despite the reproduced gaps.
- New LSP tests exercise fragmentation, coalesced messages, invalid/oversized headers, invalid message shapes, output pipe errors, and late errors after disposal. Existing language-server session tests still pass.
- Real local HTTP servers cover stalled headers, stalled bodies, cancellation, uncertain writes without retries, origin rejection, and atomic review publication. No real provider mutation was sent.
- Real temporary Git repositories cover colliding literal filenames, stale file-to-directory replacement, staged replacements, and optimistic save conflicts.
- Rendered Redux/desktop-bridge tests cover edits during publication, failed publication, route remount, persistent draft roundtrips, and isolated PR/repository ownership.
- Native packaged-app checks passed for edit → normal quit → restart → external save conflict → reload, and renderer crash → normal window close.
- Five snippet browser regressions passed using the real parse worker. Light/dark views were inspected at 1280×760 and 1024×760.
- Final full suite: **612 tests passed across 121 files**. Nine relevant browser tests and two native packaged-app tests passed. Final desktop build, app/electron/Storybook typecheck, and Storybook build passed.
- Root lint retains five pre-existing warnings in unrelated files; touched paths have no new warnings. Formatting and `git diff --check` passed.
- The first full run exposed three outdated fixture assumptions after origin and request-kind enforcement. The fixtures were corrected without weakening their assertions; the final full run passed.

No user's repository, installed app, saved workspace, or provider account was used for destructive testing. Native fault injection used isolated profiles and temporary repositories only.
