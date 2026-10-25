# Vaccination dashboard widget — upcoming + overdue

## What to build

Backend: extend `repository.DashboardRepository` with `GetUpcomingVaccinations(ctx, clinicID, withinDays int)` (`next_due_date BETWEEN today AND today + withinDays`, joined to patient for display) and `GetOverdueVaccinations(ctx, clinicID)` (`next_due_date < today`). Service consumes both. Handler adds two dashboard fields without breaking existing ones.

Frontend: dashboard card "Vaccinations Due" with two tabs/sections: Upcoming (≤30 days) and Overdue. Each row links to the vaccination detail. Empty-state copy exists.

Per the design decision in session Q5c, the source of truth is `vaccination.next_due_date` — no stored "reminder" rows. The widget is derived.

## Acceptance criteria

- [ ] Dashboard endpoint returns `upcoming` and `overdue` arrays with patient name, vaccine name, due date, and link.
- [ ] Dashboard renders the new card.
- [ ] A vaccination with `next_due_date = yesterday` appears under Overdue.
- [ ] A vaccination with `next_due_date = +10 days` appears under Upcoming.
- [ ] A completed vaccination (future: `next_due_date IS NULL` or status) does not appear.

## Blocked by

- Slice 0004 (dashboard repo refactor — new methods live in the repo)
- Slice 0005 (vaccination CRUD — vaccinations must exist to query)
