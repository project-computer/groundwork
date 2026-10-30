# Vaccine Protocols maintained globally, not per-clinic

- Formerly `docs/adr/0002-global-vaccine-protocol-table.md` — renumbered into the single `docs/decisions/` series, 2026-10-30.

Vaccinations are a first-class entity (separate from Visits) so they can drive reminders long after the administering Visit ends. To "automatically calculate next vaccination schedule," we maintain a `vaccine_protocols` lookup table (name, species, default_interval_days) and default `vaccination.next_due_date = administered_date + interval`, overridable per record.

Protocols are **global** (no `clinic_id`) because vaccine schedules are species biology, not clinic preference — rabies is annual everywhere. The controlled `vaccine_name` vocabulary is sourced from this table, so the dashboard's "most-used vaccines" aggregation works without string-matching.

## Considered Options

- **Per-clinic protocols** — rejected: there is no realistic clinic-level variation in vaccine intervals, and per-clinic protocols would fragment the controlled vocabulary that dashboard aggregation depends on.
- **Free-text vaccine name, no protocol table** — rejected: fails the "automatically calculate" requirement and breaks aggregation.
- **Rule engine for puppy/kitten series** — rejected: over-engineering for MVP. Booster chains can be added later as a "series" feature layered on the protocol table.

## Consequences

- Admins maintain the protocol list globally; clinics consume it read-only.
- A clinic that disagrees with a protocol interval can override `next_due_date` on the individual Vaccination row — the override does not propagate back to the protocol.
- Adding a new vaccine requires an admin migration (seeded INSERT), not a clinic action.
