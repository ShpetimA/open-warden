# File-tree selection completion check

Checked against `c605771` and the focused follow-up in this working tree. Repository freshness
remains owned by the existing native event service; this check changes no watcher policy.

## Gaps found and corrected

- History used `visibleFiles[0]` from its provider reply for initial/replacement selection.
  It now delegates that choice to `FileList` and its prepared visible projection.
- History's file callback switched `historyNavTarget` to Files even during automatic selection
  reconciliation. Selection now changes only the path. Pointer interaction and H/L explicitly
  choose the pane, so cached commit transitions cannot redirect subsequent J/K presses.
- Shared input replacement restored the selected file's model focus even when the user had
  focused a folder. A surviving folder keeps focus independently of the selected diff target.
- Automatic initial selection used the first prepared input path, which could be an empty
  directory or a file inside a collapsed parent. It now chooses a visible file and excludes
  inline naming rows.
- Stage and Trash completion chose a replacement before the asynchronous operation. They now read the
  live projection after success, so a group collapsed during the operation is respected.
- Changes synchronization could retarget the same source path in another bucket. It now prunes
  missing selections; the tree owns replacement order and bucket identity.
- Trash completion requested tree focus even after a newer editor gained focus. It now checks
  the originating workspace, mounted owner, current selection and current tree focus. A
  surviving focused folder remains independent of the deleted selection.

## Owners traced

| Surface          | File identity and selection owner                                                                   | Navigation and reconciliation                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Changes          | Bucket + source path projected by `ChangesUnifiedPierreFileTree`                                    | Prepared registry for J/K, ranges and mutation completion; shared tree for actual partial removals          |
| Repository files | Source path mapped through `FileList`; editor document retains repository/revision                  | Prepared visible order for Trash; shared tree for data removal; explicit focus requests for creation        |
| History          | Commit/range context + source path, with selection subscribed below `FileList` projection           | Prepared first/replacement file; commit pane remains owner until explicit pane navigation                   |
| Compare refs     | Comparison context + source path through `FileList.selection`                                       | `useReviewKeyboardNav` and the prepared registry; empty comparisons clear selection                         |
| PR Files/Commits | Aggregate/current-commit context + source path; grouped display identity includes commit title/hash | Prepared registry for J/K/V; group callbacks preserve the chosen commit when a path repeats                 |
| Guidance         | Step/reference context; local controlled file path                                                  | Prepared file movement resolves back to the step's reference; step ordering is independent of file ordering |

Remaining provider-array lookups in these paths are membership checks or lookups of the source
record for an already chosen display identity. Commit/step list navigation has its own rendered
list order; it does not define file-tree order. DOM rows are used only for focus/scroll targets.
Selection subscriptions remain below file grouping, path maps and Git-status construction.
No React memoization was introduced.

## Boundaries and verification

A surviving selected file remains selected during a retained refresh. If it disappears, the old
visible prepared order chooses the next surviving file, then the previous one. A view configured
to select an initial file falls back to its first visible file. Collapsed-only/empty trees do not
activate folder headings or hidden files. Zero-result PR filters show their existing empty state
and retain the last diff target; true empty Changes/History/comparison data clears invalid
selection. A new commit whose data is unavailable shows its existing loading/recovery state.

Existing native freshness coverage already proves mounted Files/History updates with retained
tree identity and selection. This follow-up uses real Pierre models and rendered desktop bridge
seams for the selection/focus defects. It does not change native mutations or require new watcher
reproduction. The existing 5,899-file native comparison profile remains the prior performance
baseline; a focused 2,400-file rendered comparison check covers the affected render boundary.
No new native latency or memory claim is made.

The documented intermittent PR inbox pane-resize issue belongs to inbox layout, not file-tree
selection, and is not claimed fixed here.

Validation: 39 focused Chromium checks passed across History, Repository files, Changes, Compare
refs, PR Files/Commits and Guidance. This includes cached back/forward History J/K with disjoint
and shared file paths in light/wide and dark/narrow layouts, H/L pane switching, provider-order
independence, retained failures, grouped repeated commit paths and pending-mutation expansion.
The initial Google Chrome multi-file run stalled between tests and was stopped; the completed
run used the installed Playwright headless Chromium binary, without test retries or added sleeps.
All 33 focused unit/Pierre tests passed across six files. Desktop/Electron/Storybook typechecks,
focused lint, formatting, whitespace checks and skill validation passed. The History
focus screenshots were inspected at 1440×1000 (light) and 1100×1000 (dark).
