# Agent 06 — Application Shell + Navigation

Read `00-shared-context.md` first. Requires agent 03 (design system).

## Goal

Build the desktop application shell: sidebar navigation, routing, and
placeholder screens for all Phase-2 features.

## Tasks

1. Add `react-router-dom` to `apps/clinic`.
2. `src/layouts/AppShell.tsx`: fixed sidebar + main content area.
   - Sidebar items: Dashboard, Owners, Appointments, Visits, Billing,
     Settings — with Lucide icons and keyboard-navigable focus order.
   - Top area: clinic name placeholder ("Vet Clinic") and global search
     input (non-functional stub with accessible label).
3. Routes under `src/app/` with feature folders in `src/features/`:
   `dashboard/`, `owners/`, `appointments/`, `visits/`, `billing/`,
   `settings/` — each feature exports its page component.
4. Each page = `PageHeader` (from ui kit) + `EmptyState` placeholder text
   describing what Phase 2 will add there. Dashboard shows a friendly
   "no appointments today" empty state.
5. `Settings` page shows `db_status` placeholder section (static text is
   fine; agent 07 wires real data).
6. Component test: sidebar navigation changes route; Thai labels render
   correctly where used (e.g. settings page header "การตั้งค่า" — if the
   product language is English-first, keep UI English and only assert
   Thai rendering capability in a token test; document the assumption).

## File boundaries

ONLY: `apps/clinic/src/layouts/**`, `apps/clinic/src/app/**`,
`apps/clinic/src/features/**`, `apps/clinic/src/main.tsx`,
`apps/clinic/package.json`.

## Verification (run and report output)

```
pnpm -C apps/clinic build
pnpm -C apps/clinic lint
pnpm -C apps/clinic test
```

## Notes

- Remove agent 03's temporary showcase from `App.tsx`.
- No feature logic, no data fetching — placeholders only.
- Do not commit.
