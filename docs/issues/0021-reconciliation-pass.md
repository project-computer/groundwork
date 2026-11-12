# Reconciliation for offline local-only writes

## Why

ADR 0025's fallback is deliberate: when vetcare is unreachable, a
registration/edit commits to the document alone. That row then exists only
in the document until something reconciles it into the normalized store.
Today the only reconciliation is a full importer run — correct but heavy,
and it is whole-DB (fresh-target-only). Features being cut over (issue 0020)
need an entity-level repair path.

## What to build

- `POST /api/v1/reconcile` (admin-only): accepts a list of client-side
  entities (owner/pet/appointment/…), each with its client-minted id; the
  server upserts idempotently — insert when absent, diff-and-update when
  present, and report per-entity outcomes
  (`created | updated | conflict`).
- Conflict policy: field-level last-write-wins with the entity's `version`
  (document versions increment on every edit; REST rows gain
  `updated_at`), ties resolved in the document's favour — the clinic's
  working set wins.
- Frontend: the store runs a reconciliation pass when REST becomes reachable
  and the outbox (or a new `localOnly` marker) is non-empty; results surface
  in the sync/status UI where the outbox already reports.
- Audited: one `data.reconciled` event per pass with the outcome summary.

## Acceptance criteria

- [ ] A registration made offline appears in REST after the pass, under its
      client-minted id.
- [ ] A row edited on both sides converges to the document's values when the
      document version is higher.
- [ ] The pass is idempotent — running it twice changes nothing the second
      time.
- [ ] Non-admin callers get 403; every pass is auditable.

## Blocked by

- Nothing. Should land before a pilot clinic relies on offline periods
  longer than a session (see issue 0020 slice 4 for the read-side pair).
