# Docs map

Two kinds of documents live here — check which one you are reading before
acting on it. Living docs describe the system as it is; historical records
are frozen at the time they were written and never updated to match later
code.

## Living docs

| Path | Contents |
|---|---|
| `architecture.md` | System architecture: app/sidecar/server split, persistence, sync |
| `data-model.md` | Clinic document shape, entities, migration history |
| `RELEASE-READINESS.md` | Prioritized release-gap checklist (P0–P2) with acceptance criteria |
| `decisions/` | ADRs 0001–0025, the single decision series (append-only) |

## Historical records (do not update to match later code)

| Path | Contents |
|---|---|
| `PLAN.md` | Original execution plan for the platform build |
| `plans/` | Point-in-time feature plans, kept as a historical record |
| `agents/` | Scaffolding playbook (00–09) from the original repo build |
| `issues/` | Issue series: 0000–0012 from the original build (historical); 0013+ from the 2026-11-06 offline-MVP plan reconciliation (active backlog) |

## ADR numbering note

ADRs 0016–0019 (domain-model decisions: owner entity, global vaccine
protocols, item/lot ledger, deferred multi-tenancy) were originally numbered
0001–0004 in the now-removed `docs/adr/` series. References to
"ADR-0001…0004" in older material may therefore mean either series; the
authoritative numbering is the one in `decisions/`. When citing an ADR,
cite the `decisions/` number.
