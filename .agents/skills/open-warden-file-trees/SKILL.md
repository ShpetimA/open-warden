---
name: open-warden-file-trees
description: Implement or debug Open Warden file trees, grouping, selection, keyboard focus, mutation navigation, and large-repository rendering. Use for Pierre tree changes; not ordinary diff styling or unrelated lists.
---

# Open Warden file trees

Read AGENTS.md and apply readable-code, coding-standards, and open-warden-design-system when relevant. Inspect the owning tree and its tests before editing.

## One prepared model

`FileList` projects source files into display identities. Review groups, repeated commit paths, flat-list disambiguation, and Changes buckets are meaningful parts of those identities. `SelectedPierreFileTree` places the Redux selection subscription below that work. `PierreFileTreeBrowser` owns the live Pierre model and its prepared input.

Keep source identity separate from display path. Preserve bucket identity and commit/revision context when selecting, commenting, staging, or returning to a diff. A path repeated under two commits represents two different review targets.

Pass `FileList.selection` a leaf Redux selector, or use `SelectedPierreFileTree`. Controlled strings are appropriate for local UI state. A component listening to active selection must not also rebuild projections, groups, path maps, or Git status. Do not introduce memo/useMemo/useCallback to hide subscription mistakes.

## Navigation and mutations

Use `pierreFileTreeNavigation.ts` and the renderer's registered prepared projection. J/K uses `movePierreFileTreeFileForKey`; hierarchy movement uses `movePierreFileTreeHierarchy`. Read live expansion and preserve the renderer's flattening rules.

For selection after removal, `preparedFileAfterRemoval` chooses the next visible surviving file, then the previous file at the boundary. Bucketed mutations use `getPierreFileAfterRemoval`. Capture the originating workspace and selection before a mutation. Resolve its replacement from the live prepared projection when the mutation succeeds; expansion or filtering may have changed while it was pending. Activate only if the originating workspace and selection are still current. Failed operations must not advance optimistically; reconcile any actual partial removal through the same prepared model. Do not jump to a collapsed file, folder heading, temporary input, or another occurrence of the same source path.

Do not build an alternative order from provider arrays, an alphabetic sort, or mounted DOM rows. DOM lookup is for focusing/scrolling an already chosen identity, never for deciding order. Virtualized offscreen files still participate in the model.

Selection and keyboard focus are separate. A reconciliation callback selects a review target; it must not switch the active pane. History's file callback dispatches `setActivePath`; explicit clicks and H/L own `historyNavTarget`. `useHistorySync` clears unavailable selections but never chooses a provider-array first file. Initial selection comes from visible files in the registered prepared projection, excluding directories and inline editors.

During data replacement preserve the mounted tree, collapsed/expanded directories, selection, focus owner, and scroll. Preserve a surviving focused folder even when a different file stays selected. Mutation completion must not restore tree focus after the user moves to an editor or another workspace; an unmounted origin cannot request focus. Retained-read loading/error surfaces must not unmount it. Do not steal focus from an editor or search field during background refresh. Use existing explicit tree-focus requests for virtualized row readiness; investigate failures instead of adding arbitrary sleeps or test retries.

## Freshness and performance

Native repository mutation completion and filesystem hints feed `RepositoryEvents`; `RepositoryFreshnessBootstrap` translates them into repository-scoped query invalidation. Reads do not publish mutation events. Extend that policy instead of adding another watcher or polling loop in a pane. Keep immutable commit data separate from mutable worktree/ref data.

Prepared navigation indexes resolve directory handles when input changes, then read live expansion. Selection-only registration must not rebuild grouping, sorting, directory indexes, or status. Retain RTK Query data references with narrow `selectFromResult` subscriptions. Large trees are virtualized; a small mounted row count does not prove inexpensive preparation.

## Verification

Use real Pierre models to exercise prepared order, collapsed and flattened directories, repeated paths, and bucket identity. Through rendered UI verify success, failure, removal, filtering, refresh, and keyboard focus; preserve assertions rather than hiding intermittent failures. Test actual native watchers/mutations with temporary Git repositories, never test writes in a user's repository.

Relevant suites:

- `components/pierreFileTreeProjection.test.ts` and `pierreFileTreeRemoval.test.ts`
- `tests/e2e/changes-refresh.spec.ts`, `tests/e2e/file-editing.spec.ts`, and `tests/e2e/history-commits.spec.ts`
- `tests/e2e/branch-review.spec.ts` and `tests/e2e/pull-request-commits.spec.ts`
- `tests/electron/repository-freshness.spec.ts`

For performance-sensitive changes run `tests/electron/branch-review-navigation.spec.ts` with `OPEN_WARDEN_REVIEW_REPO`, `OPEN_WARDEN_REVIEW_BASE`, `OPEN_WARDEN_REVIEW_HEAD`, and optional `OPEN_WARDEN_REVIEW_FILE` / `OPEN_WARDEN_RENDERER_URL`. It uses real Git data read-only and saves a CPU profile. Include deep paths, thousands of files, and a rendered diff. Record what was actually measured; synthetic shallow trees and passing correctness tests do not establish native latency or memory guarantees.
