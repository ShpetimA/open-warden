# Pierre screen audit — 29 October 2026

## Findings and changes

The branch-review selection boundary was too high. `ReviewFileList` subscribed to the active file and rebuilt `FileList`'s grouped paths, source maps, group counts, and Git statuses on every move. A new status array also caused `PierreFileTreeBrowser` to call `setGitStatus`, which asks Pierre to render its tree again. The browser reproduction retained the host and row nodes; a complete tree remount was not observed.

`FileList` now owns file projection and decorations. `SelectedPierreFileTree` subscribes to selection below that work and translates the source path through an already-built map. Data changes still rebuild the projection; selecting a different file updates selection and focus. This follows the composition already used by Changes, without adding `memo`, `useMemo`, or `useCallback`.

Review comment badges now subscribe to an indexed count map for the repository and comparison refs. Selecting a file does not scan the comment collection or rebuild that map. Unrelated comments with unchanged counts do not invalidate the review tree.

Two other consistency gaps were found and fixed:

- Changes, repository files, and History used row navigation for J/K; PRs, branch review, and Guidance used file navigation. All now call `movePierreFileTreeFileForKey`: J/K skips folder headings; arrow keys retain Pierre's folder-aware navigation.
- Navigation's directory anchors included intermediate folders hidden by flattened directory chains. The visible projection now uses the same flattening setting as the renderer and ignores collapsed intermediate directories that Pierre folds into a combined row.

The unused DOM-index navigation readers were removed so a future screen cannot accidentally revive a second ordering source. Keyboard binding tests now exercise the real hotkey library instead of patching it.

Branch Base and Compare now use the canonical searchable combobox. Search does not change the comparison until an option is chosen. Enter selects, Escape restores the selected branch, no-match feedback is explicit, and Swap remains available.

## Tree coverage

Every live tree reaches `PierreFileTreeBrowser`. It owns the persistent Pierre model, the prepared render input, selection/focus synchronization, the navigation registry, and data-only path resets.

| Screen/context                                  | Tree entry point                                         | Ordering and selection after this change                                                                     |
| ----------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Changes: staged, unstaged, untracked, conflicts | `ChangesUnifiedPierreFileTree`                           | Existing connected boundary preserves bucket identity; shared key policy and prepared order                  |
| Repository Files                                | `RepoFilesTab` → `FileList`                              | Redux selection moved below projection; source/display identity preserved in flat mode                       |
| History: single commit                          | `HistoryFilesPane` → `FileList`                          | Redux selection moved below projection; restore-file control has its own selected-file subscription          |
| History: selected commit range                  | `HistoryFilesPane` → `FileList`                          | Same boundary and prepared order as single-commit files                                                      |
| Branch Review                                   | `ReviewFileList` → `FileList`                            | Selection and indexed comment counts isolated; first file comes from prepared order                          |
| Hosted PR: all files                            | `PullRequestFileList` → `FileList`                       | Selection isolated; filters, viewed state, V, and J/K use the prepared projection                            |
| Hosted PR: selected commit                      | `PullRequestFileList` → `FileList`                       | Same selection boundary; commit-specific diff refs retained                                                  |
| Hosted PR: grouped by commit                    | `PullRequestCommitFileGroups` → `SelectedPierreFileTree` | Selection isolated; each commit/file display identity stays distinct                                         |
| Local PR review                                 | `PullRequestFilesSidebar` → `ReviewFileList`             | Receives the same branch-review boundary and first-file behavior                                             |
| Guidance: files for a step                      | `GuidanceFiles` → `PierreFileTreeBrowser`                | Small, step-scoped controlled tree; shared prepared order and key policy; local reference selection retained |

`SourceControlFileBrowser` has no live callers. Its controlled wrapper still delegates to `FileList`; it does not introduce another sort or model.

Guidance intentionally keeps controlled local reference selection: choosing another code range in the same file does not mean changing files. It is not presented as a Redux-isolated projection. Large walkthroughs would need a separate profile before expanding that model.

## Diff coverage

File-tree navigation and diff rendering have different ownership. A file change should update the diff; it should not rebuild the tree's file data.

| Surface                                            | Renderer and ownership                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Changes                                            | `ChangesDiffPane` → `DiffWorkspace` → `DiffViewer`; selected-file query is separate from the sidebar                                    |
| History, including ranges and graph-opened commits | `HistoryDiffPane` → `DiffWorkspace`; comparison refs and selected-file query live in the diff pane                                      |
| Branch Review                                      | `ReviewDiffPane` → `DiffWorkspace`; selected path and the 40 ms diff-selection debounce live outside the tree data owner                |
| Hosted PR files/commits                            | `FilesDiffViewer` → `DiffWorkspace`; commit refs and file versions are resolved independently of tree projection                        |
| Local PR review                                    | `PullRequestDiffPane` → `DiffWorkspace`; PR annotations are composed at the diff boundary                                               |
| Guidance code ranges                               | `GuidanceDiff` → `DiffWorkspace`; step/reference identity controls highlighting and file queries                                        |
| PR overview/windowed snippets                      | `PullRequestWindowedDiff`; intentional range-limited renderer, not a navigable file tree                                                |
| Repository file viewer                             | `GeneralFileViewer` → Pierre `File`/`Virtualizer`; complete-file contents rather than a two-version comparison                          |
| Merge resolution                                   | `MergeConflictViewer` → Pierre `UnresolvedFile`/`Virtualizer`; keyed by conflict file identity so resolution state belongs to that file |
| Symbol peek                                        | `LspSymbolPeek` → Pierre `File`; preview selection belongs to the peek and should not move the owning tree                              |

These specialized viewers should not be forced through a tree-selection API. Their existing parser/options caches were not rewritten as part of the tree fix. The audit did not reproduce a separate diff renderer defect. Full-file, merge, and LSP renderers were inspected in source; their every interaction was not newly exercised in a native Electron session.

## Rules for future screens

1. Project and sort files in the data owner. Pass the renderer's prepared input to navigation; do not accept a second provider-array order in keyboard code.
2. For Redux-backed lists, pass a selector to `FileList.selection`. Keep the active-path subscription in `SelectedPierreFileTree`, below maps, statuses, and grouping.
3. Use controlled selection for truly local UI. Do not read a Redux path in a large screen just to pass it back as a string.
4. Keep bucket/commit identity separate from real paths. A basename, or a real path alone under multiple commits, is not a unique row identity.
5. Use `movePierreFileTreeFileForKey` for keyboard movement. Native arrows may focus folders without changing the selected file.
6. Refresh decorations when comment/viewed/status data changes. Selection alone must not create new status arrays or reset paths.
7. Reset the Pierre model only for actual file-data changes. Folder expansion, scroll, and focus must survive navigation.
8. Query and render the diff at its own leaf. Do not attach file-version loading or hover state to the sidebar's projection owner.

## Verification

- A real React/Redux/Pierre integration renders 2,400 files, changes selection 15 times, retains the tree host, and performs no additional status projection reads. Refreshing the file data then updates all statuses and accepts a newly added file.
- Browser coverage exercises a 2,400-file branch comparison, searchable choices among 304 branches, no-match search, keyboard selection, Escape, long refs, swapping, and light/dark layouts at 1,440 and 1,000 px.
- Existing PR, History, and Guidance browser suites cover grouping, duplicate file names across commits, folder collapse, filters, V, J/K, pane navigation, and delayed hover cards.
- The synthetic browser fixture navigated without replacing visible file rows. Timing from one local run is not evidence of a performance guarantee for the user's repository; the regression guard checks repeated work directly.
