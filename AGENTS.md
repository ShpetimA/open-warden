# Agent Engineering Rules

- Use `@tanstack/react-hotkeys` for keyboard shortcuts in the desktop app.
- Do not use React memoization as a render escape hatch (`React.memo`, `useMemo`, `useCallback`) to mask render flow problems.
- Prefer component composition with Redux-connected boundaries to control render scope:
  - Read only the necessary slice in each component.
  - Keep frequently changing state subscriptions as close to the leaf component as possible.
- Use RTK Query selectFromResult to subscribe only to needed fields.
- Ignore backwards compatibility to apis unless explicitly told so
- For api reference github or bitbucket ./api-ref/
- Pierre file lists use `FileList.selection` with a Redux selector, or `SelectedPierreFileTree`, to keep active-path subscriptions below file projection, grouping, lookup maps, and Git-status construction. Controlled selection is for local UI state.
- Pierre keyboard navigation uses `movePierreFileTreeFileForKey` and the renderer's prepared projection. Do not derive another navigation order from provider arrays or mounted DOM rows. Preserve bucket/commit identity and the renderer's flattening and expansion rules.
- For file-tree rendering, grouping, selection, mutation navigation, or performance work, read `.agents/skills/open-warden-file-trees/SKILL.md`. Native repository freshness belongs to the shared event owner; panes must not introduce their own watchers.
- Keep automatic file selection separate from pane navigation; refreshing a file list must not switch the active pane.
