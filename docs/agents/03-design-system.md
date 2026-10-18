# Agent 03 — Design System Foundation

Read `00-shared-context.md` first. Requires agent 01. Independent of 02.

## Goal

Establish Tailwind CSS v4 + design tokens + Base UI integration and the
first base components inside `apps/clinic/src/components/ui/`.

## Tasks

1. Add Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite` plugin) and
   `@base-ui-components/react`, `lucide-react`.
2. Configure Tailwind via CSS-first v4 setup (`@import "tailwindcss"` +
   `@theme` in `src/index.css` — no tailwind.config.js unless required).
3. Define semantic tokens in `@theme` for:
   - `surface`, `surface-raised`, `text-primary`, `text-muted`, `border`
   - `primary`, `success`, `warning`, `destructive` (+ hover/active states)
   - spacing scale, radii, focus ring, elevation shadows
   - Light theme first; structure tokens so a dark theme can be added
     later without renaming (documented assumption).
4. Base components in `src/components/ui/` — implement ONLY these, as thin
   styled wrappers over Base UI / native elements where Base UI has no
   primitive:
   `Button`, `TextField`, `FormField`, `Dialog`, `Tooltip`, `Tabs`,
   `StatusBadge`, `PageHeader`, `EmptyState`, `LoadingState`.
   Each: consistent focus-visible ring, disabled state, keyboard support
   inherited from Base UI. Use semantic token classes only — no raw hex.
5. A `src/components/ui/README.md` (or section in app README) documenting
   token names and when to add a new wrapper.
6. Component tests (vitest + RTL) for Button and Dialog at minimum:
   rendering, keyboard interaction, disabled state.
7. Verify Thai text renders (add a Thai string in one test, e.g. "คลินิก").

## File boundaries

ONLY: `apps/clinic/src/index.css`, `apps/clinic/src/components/ui/**`,
`apps/clinic/src/App.tsx` (may add a temporary token/component showcase —
agent 06 will replace it), `apps/clinic/package.json`.

## Verification (run and report output)

```
pnpm -C apps/clinic build
pnpm -C apps/clinic lint
pnpm -C apps/clinic test
```

## Notes

- Do NOT build veterinary-specific components (pet cards, invoices) —
  those belong to feature work in Phase 2.
- Do not commit.
