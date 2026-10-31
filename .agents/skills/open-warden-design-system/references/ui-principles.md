# Open Warden UI principles

Open Warden should feel calm, precise, and dependable while retaining the density expected from a desktop source-control tool. Establish hierarchy with typography, alignment, and proximity before adding borders, shadows, or extra surfaces.

## Hierarchy and alignment

- Decide the primary element and reading order before styling. It should remain obvious in grayscale or when briefly blurred.
- Give each visual group one dominant alignment axis. Prefer a few strong edges over many nearly aligned coordinates.
- Use no more than three text levels inside a compact surface. Sibling roles use the same preset.
- Reserve larger type for route and panel identity. Dense rows use 12–14px metadata and 14–16px primary labels.
- Muted text is secondary, not faint. Use tabular numerals for counts, line numbers, dates, durations, and diff statistics.
- Use monospace only for code, refs, hashes, file paths when alignment helps, and machine-shaped values.

## Spacing and geometry

- Use the four-pixel rhythm. Keep gaps within a group smaller than gaps between groups.
- Parent layouts own sibling spacing through `gap`; children do not impose unexplained outer margins.
- Padding defines a container interior. Gap defines sibling relationships.
- Desktop density must not reduce interactive hit areas below 40px unless a larger non-overlapping invisible hit target is provided.
- Nested surfaces use concentric radii: outer radius equals inner radius plus the inset.
- Resizable panes preserve useful minimum sizes, reachable actions, and one clear scroll owner per region.

## Color, surfaces, and motion

- Consume semantic variables exposed through Tailwind. Feature styling does not use physical palette colors when a semantic token exists.
- Source-control states use `diff-addition`, `diff-deletion`, `diff-modification`, and `diff-conflict`; hue is never the only state indicator.
- Canvas, inset panel, raised, overlay, toolbar, and active surfaces have distinct roles. Use depth only for actual elevation or focus.
- Keep dividers as borders. Use layered shadows for raised cards, menus, popovers, and dialogs where depth matters.
- Use interruptible CSS transitions for interaction changes and name only the properties that change. Respect reduced motion.
- Press feedback may use `scale(0.96)` when it does not distract or reflow surrounding content.

## Components and behavior

- Standard buttons, fields, selection controls, menus, popovers, dialogs, tooltips, and scroll areas come from `src/components/ui`.
- Use buttons for actions and links for navigation. Icon-only controls require explicit accessible names and tooltips when meaning is not obvious.
- Persistent form labels identify fields; placeholders show examples or formats.
- Async actions keep the canonical control mounted, communicate progress, and prevent duplicate activation.
- Use menus for actions, comboboxes for searchable choices, popovers for anchored context, dialogs for blocking workflows, alert dialogs for consequential decisions, and alerts for inline status.
- Keyboard shortcuts use `@tanstack/react-hotkeys` and remain discoverable through labels, menus, or `Kbd` hints.

## Evolving the system

- Extend an existing component when the responsibility is unchanged and reusable.
- Create a canonical component when the semantic role or interaction model is distinct.
- Keep experimental or one-screen composition feature-owned until a stable API is visible through repeated use.
- Do not turn a single screenshot correction into a universal rule.
