# Multi-branch deferred but schema-ready via single ClinicContext resolver

- Formerly `docs/adr/0004-defer-but-ready-multi-tenancy.md` — renumbered into the single `docs/decisions/` series, 2026-10-30.

Every operational table since the initial migration carries `clinic_id INT REFERENCES clinics(id)`, and every repository method already takes a `clinicID int` parameter. But handlers hard-code `clinicID := 1 // TODO: Get from user context`. We commit to preserving that pattern rather than either finishing multi-branch now or ripping the column out.

New entities (Owner, Vaccination, InventoryItem, InventoryLot, StockMovement, Supplier, NotificationLog) all carry `clinic_id` and pass it through their repo methods. We introduce a single resolver — `auth.GetClinicID(ctx)` — returning `1` today and reading from a JWT claim (`clinic_id` on User) when multi-branch goes live. Activation is a one-day wiring job: swap the resolver body, add a migration to populate `users.clinic_id`, and ship branch CRUD UI. No query audit, no refactor.

## Considered Options

- **Finish multi-branch now** — rejected: branch CRUD, subdomain routing, per-branch admin UI, and per-branch user management are all out of MVP scope and add auth/permission complexity that a single clinic does not need.
- **Freeze single-clinic by removing `clinic_id`** — rejected: wastes the existing schema and forces a full audit later. Keeping the column is nearly free.

## Consequences

- Vaccine Protocols are **global** (no `clinic_id`) — see ADR-0017. Everything else operational is tenant-scoped.
- Users are 1-to-1 with clinics for MVP (no `user_clinics` join). Locum vets are not supported; if needed later, the join is an additive migration.
- Tenant resolution, when activated, comes from a JWT claim — not subdomain or header. Subdomain routing can be layered on later as middleware that sets the claim at login.
- CaseTransfer preserves isolation via **copy-on-receive**: the receiving clinic clones Patient + Visits with new IDs, stamped with `original_clinic_id` for audit. No shared rows across clinics.
