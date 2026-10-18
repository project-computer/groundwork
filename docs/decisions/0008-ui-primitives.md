# 0008 — Base UI + Tailwind v4 semantic tokens

- Status: accepted
- Date: 2026-10-16

## Context

The app needs accessible primitives (dialogs, tabs, tooltips) and consistent
styling across desktop, mobile, and web from one codebase.

## Decision

Base UI for interaction primitives, Tailwind CSS v4 (CSS-first `@theme`) for
semantic tokens (`surface`, `text-primary`, `primary`, `success`, `warning`,
`destructive`…). Wrap a primitive only to establish styling/behavior
conventions, not automatically.

## Consequences

- Light theme first; dark theme later without renaming tokens.
- Gotcha (documented): `Dialog` from `@base-ui-components/react/dialog` is a
  parts namespace — always render `<Dialog.Root>`, never `<Dialog>`. Our
  `src/components/ui/Dialog.tsx` wraps this correctly.
