# Agent Engineering Rules

- Use `@tanstack/react-hotkeys` for keyboard shortcuts in the desktop app.
- Do not use React memoization as a render escape hatch (`React.memo`, `useMemo`, `useCallback`) to mask render flow problems.
- Prefer component composition with Redux-connected boundaries to control render scope:
  - Read only the necessary slice in each component.
  - Keep frequently changing state subscriptions as close to the leaf component as possible.
- Use RTK Query selectFromResult to subscribe only to needed fields.
- Ignore backwards compatibility to apis unless explicitly told so
- For api reference github or bitbucket ./api-ref/
