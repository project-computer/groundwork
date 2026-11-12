# 0025 — REST-first writes with document projection

- Status: accepted
- Date: 2026-11-12
- Amends: 0012 (document persistence), 0023 (normalized backend)

## Context

The frontend reducer owns every domain write: `commit` records the change,
its audit event and its outbox entry in one state transition, and the clinic
document is the unit the sidecar persists and syncs (ADR 0012). The
normalized REST backend (ADR 0023) is now the durable store for the data the
plan covers — but clinics run offline-first, and the UI reads the document.

Cutting a feature over therefore cannot mean "replace the store": it must
mean the write reaches REST *first* while the document stays the projection
the UI reads.

## Decision

For each cut-over feature, mutations follow one pattern, orchestrated in the
store (never in components, matching ADR 0024):

1. **The client mints the id** (UUID). Creation routes accept an optional
   client id (`requestID` validates; absent → server mints). Identity is
   never minted twice: the document row and the REST row share one id, so
   the importer round-trips and pre-cutover owners converge via
   `restEnsureOwner` (GET, then POST under the document's id on 404).
2. **REST is attempted first.** It is the durable, normalized record.
3. **The document is projected from the server's response.** The reducer's
   ordinary actions accept optional ids/mrn/version in their payloads and
   mint locally only when a write stayed local. The server-allocated MRN
   flows into the document — one MRN per patient, server-authoritative.
4. **Unreachable REST degrades to a local-only commit.** The clinic never
   blocks on REST; the write is exactly the pre-cutover behaviour (outbox +
   sync path). Divergence is logged loudly. Reconciliation for local-only
   writes is a follow-up (issue 0021), not a silent assumption.
5. **Validation stays in the reducer** where it exists today (invariants are
   not duplicated into components); REST errors surface through the same
   `lastRejection`/notice channels where applicable.

Slice 1 (shipped): owner + patient registration (`registerOwnerAndPatient`,
`registerPatient` in the store, used by the registration view).

## Consequences

- While REST is configured, a registration exists in both stores with one
  identity; after an offline local-only commit it exists in the document
  alone until reconciliation runs.
- The server trusts client-minted UUIDs on creation. That is acceptable on a
  loopback, secret-gated, authenticated API: ids are opaque, uniqueness is
  enforced by the schema, and the alternative (server-only ids) would fork
  identity on every offline-first write.
- Feature slices land one at a time (issue 0020); a feature is either cut
  over or not — no half-REST writes inside one feature.
