# 0015 — The reducer rejects through `session.lastRejection`, never silently

- Status: accepted
- Date: 2026-10-29

## Context

The store reducer is the single home for write-path invariants (stock floors,
refund headroom, RBAC, payment rules), but when it refuses an action it
`return store`s with no signal. The UI cannot explain a no-op, so every View
re-implements the rules inline to keep buttons disabled — and the copies drift.
Three rules currently exist only in the UI (`addPrescription` performs no
stock check at all; the caller decides whether a payment settles;
`usePermission` grants `inventory.write` to veterinarians while the reducer's
role matrix drops those dispatches silently). The frontend refactor plan
([2026-10-29](../plans/2026-10-29-frontend-refactor.md)) moves these invariants
into the reducer; they need a rejection channel.

Alternatives considered during planning: making `guardedDispatch` return a
result (every caller must opt in; the rejection is invisible to anything not
holding the dispatch) and doing both (two channels for one fact).

## Decision

Rejected actions are recorded in state, not in return values:

- The reducer writes `session.lastRejection: { code, message, at } | null`
  when it refuses an action, and clears it on the next successful commit.
- `code` is a stable machine identifier (`'stock.shortage'`,
  `'payment.overpayment'`, `'rbac.denied'`, …) so Views and tests can branch
  on it; `message` is a human-readable string for banners.
- The dispatch signature does not change. Any component can render the
  current rejection (same pattern as `SaveErrorBanner`), and any test can
  assert it with plain Node against the reducer — no rendering, no mocks.
- `lastRejection` is ephemeral UI feedback, not an audit event. It is never
  committed to the document and never enters the sync outbox; audit events
  continue to record what *did* happen, one per commit.
- UI-side guards become presentation only (disabled buttons, hints derived
  from the same rules). Enforcement lives exclusively in the reducer.

## Consequences

- Silent no-ops disappear: a click that does nothing always has a reason the
  UI can show.
- One copy of each rule. A rule fixed in the reducer is fixed for every
  caller — UI, e2e, future cloud replay.
- The rejection is advisory for renders (a banner may be missed if another
  action succeeds immediately); it is authoritative for tests.
- New rejections must mint a `code` and clear on success — both are part of
  the reducer's contract and are covered by `store.test.ts`.
