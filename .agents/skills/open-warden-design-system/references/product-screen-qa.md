# Product-screen QA

Use this for routed flows, screenshot feedback, resizable layouts, overflow, or defects visible only in the rendered application.

## Composition ownership

- `AppShell` owns desktop navigation and top-level regions; route layouts own pane structure and scroll boundaries; screens own headers, sections, fields, and actions.
- One spacing decision has one owner. Double-owned padding causes sibling routes and nested panes to drift.
- Keep related actions together and preserve logical keyboard order.
- Each bounded workspace has one deliberate scroll owner. Diff content, file trees, and sidebars must not accidentally compete for wheel or keyboard scrolling.

## Render the actual state

1. Open the exact route, repository state, selection, theme, window size, and pane widths involved.
2. Reproduce the defect before editing when possible.
3. After editing, inspect narrow and wide windows, resized panes, long paths, large counts, empty data, and both themes.
4. Exercise the complete transition, including loading, success, failure, selection, and dismissal. Confirm stale state does not flash.
5. Use keyboard navigation and verify focus movement, activation, shortcuts, dismissal, and focus return.
6. Check alignment axes, group spacing, wrapping, truncation, clipping, scroll ownership, stable row sizes, and reachable actions.
7. Capture before and after screenshots at the same route, repository state, theme, window size, pane widths, and interaction state for visible UI changes.

## Storybook review

- Canonical component stories cover meaningful variants and applicable normal, focus-visible, disabled, loading, invalid, selected, and destructive states.
- Foundation stories render semantic tokens and typography in light and dark themes.
- Stories avoid feature services and hidden global state. Provide data through public component inputs or an intentional provider seam.
- Treat accessibility addon failures as errors for canonical components.

## Finish gate

Do not report a visible issue fixed until the exact state has been rendered after the change. Passing tests and Storybook builds do not substitute for visual inspection. State what route or story, window size, theme, pane state, and interaction were checked, and disclose anything that could not be reproduced.
