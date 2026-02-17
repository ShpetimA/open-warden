# Agent Engineering Rules

- Use `@tanstack/react-hotkeys` for keyboard shortcuts in the desktop app instead of custom `window` key listeners.
- Do not use React memoization as a render escape hatch (`React.memo`, `useMemo`, `useCallback`) to mask render flow problems.
- Prefer component composition with Redux-connected boundaries to control render scope:
  - Read only the necessary slice in each component.
  - Keep frequently changing state subscriptions as close to the leaf component as possible.

- Prefer small helper functions over multi-line conditional expressions for readability.
- Use RTK Query selectFromResult to subscribe only to needed fields.
- Keep render trees shallow and avoid letting selection state re-render list containers.
