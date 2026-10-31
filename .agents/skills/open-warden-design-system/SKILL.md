---
name: open-warden-design-system
description: Build or review visible Open Warden desktop UI, including semantic tokens, canonical components, dense source-control layouts, accessibility, Storybook coverage, and visual polish. Use for UI implementation or screenshot feedback; not for business-logic-only work.
---

# Open Warden desktop UI

Read [references/ui-principles.md](references/ui-principles.md) before changing visible UI. For routed flows, screenshots, responsive behavior, overflow, or browser-visible defects, also read [references/product-screen-qa.md](references/product-screen-qa.md).

Storybook is the living definition for foundations and canonical components. The rendered desktop application is the review surface for feature composition.

## Ownership

- Keep semantic tokens in `apps/desktop/src/index.css`, reusable controls in `apps/desktop/src/components/ui`, and design-system documentation in `apps/desktop/src/design-system`.
- Keep feature-specific composition and business behavior with the owning feature until a stable reusable responsibility emerges.
- Reuse the established Base UI, Radix, and shadcn primitives. Preserve their accessibility and interaction contracts when styling them.
- Use `@tanstack/react-hotkeys` for desktop keyboard shortcuts.
- Read only the necessary Redux state at each connected boundary and keep rapidly changing subscriptions near leaf components.

## Work

1. Inspect the nearest component, its public API, stories or screen usage, and relevant tests.
2. Define information hierarchy, alignment axes, grouping, interaction states, and responsive or resize behavior before editing.
3. Use semantic tokens and canonical controls. Do not add feature-local physical palette colors when a semantic role exists.
4. Add or update stories for changed canonical behavior and meaningful states. Test rendered user behavior where coverage is needed.
5. Render the result in Storybook and its real application context. Exercise affected transitions and keyboard behavior.

## Finish gate

- Hierarchy and alignment are clear at a glance in the dense desktop layout.
- Keyboard access, focus visibility, accessible names, and relevant loading, error, selected, conflict, and disabled states work.
- Dynamic counts and diff statistics use tabular numerals; transitions target explicit properties and respect reduced motion.
- The affected widths and both themes were rendered. Tests and source inspection do not replace visual verification.
- Focused tests, Storybook build, typecheck, formatting, and `git diff --check` pass in proportion to the change.
