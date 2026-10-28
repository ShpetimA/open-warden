# Review file ordering and navigation

The file browser owns the displayed order. Provider and Git results supply file data; their array order is not a navigation contract.

## Data flow

1. The PR pane filters the source files by search and comment filters.
2. `FileList` projects those files into the selected grouping. Review groups add category headings; folders retain paths; the flat list gives duplicate basenames distinct display identities. Commit groups include the commit identity in each display path.
3. `PierreFileTreeBrowser` prepares that projection with Pierre's sorting rules. The exact prepared input is passed to both the renderer and the navigation registry.
4. Navigation reads the prepared path order and Pierre's live expansion state. It does not sort another tree or infer order from mounted DOM rows, which may be virtualized.
5. Selecting a display identity resolves back to its source file. Commit grouping also resolves the owning commit, so the same real file can be opened independently under multiple commits.

## Consumers

- J/K moves between visible files, skipping directory headings.
- Arrow keys retain Pierre's directory-aware tree navigation.
- Shift navigation selects ranges in the same visible file order.
- V marks the active file viewed and advances to the next unviewed, visible file. It wraps once, skips collapsed folders, and stays put if no eligible file remains. Unmarking a viewed file stays on it.
- Shift+V toggles viewed state without advancing.
- When a selection is missing after loading or filtering, the PR browser chooses the first prepared file. The outer PR screen only clears selection when there are no files.

The provider's viewed state applies to the whole PR file. Per-commit views retain their distinct commit/file selection; they do not pretend that provider viewed flags track each commit separately.

## Why the old behavior drifted

Rendering sorted grouped display paths, J/K rebuilt a separate application tree, and V sliced the original provider array. Two selection effects also chose the first provider file. This allowed each consumer to disagree about what “next” meant.

The registry now receives the renderer's prepared input instead of a second sorting configuration. The obsolete keyboard hook callbacks that accepted provider file arrays have been removed.

## Hover cards

Folder, commit, and PR tab cards use `DelayedHoverCardGroup`. Pointer movement opens the first card after 700 ms. Once open, moving to another target in the same group skips that delay; leaving the group resets it. Keyboard navigation and ordinary file rows do not open these cards. PR details are queried only when the card mounts and reuse the hosted conversation cache.
