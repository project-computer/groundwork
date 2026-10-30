# Dashboard repository refactor — move raw SQL out of DashboardHandler

## What to build

`server/internal/handlers/dashboard_handler.go` runs raw SQL against `*pgxpool.Pool` directly (at least 5 queries today). Lift this into a `repository.DashboardRepository` (raw pgx, consistent with the rest of the repo layer) and a `service.DashboardService` that consumes the repo. Handler becomes thin: parse query params, call service, render response.

No new endpoints, no response shape change, no UI changes. Zero behavior delta visible to callers.

## Acceptance criteria

- [ ] `dashboard_handler.go` has no `*pgxpool.Pool` field and no `db.Query` / `db.QueryRow` calls.
- [ ] Every existing dashboard query (appointment count, in-progress visit count, today/week/month revenue, active patient count, monthly revenue series) is reproduced through the repo layer.
- [ ] Smoke tests (slice 0000) for `DashboardHandler` cover the same payload shapes as before.
- [ ] Frontend dashboard still renders identically.

## Blocked by

- Slice 0000 (test infrastructure)
