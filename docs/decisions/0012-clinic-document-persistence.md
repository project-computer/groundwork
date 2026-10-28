# 0012 — The full clinic document stays the source of truth

- Status: accepted
- Date: 2026-10-28
- Amends: 0010 (sidecar owns desktop persistence)

## Context

ADR 0010 gave the Go sidecar ownership of desktop persistence: it stores the
clinic state in normalized SQLite tables (`patients`, `appointments`,
`medical_records`, `clinic_settings`) and the webview wrote to it first,
falling back to the Rust-managed `clinic_state` row only when the sidecar was
unreachable.

That projection is a subset of the document. It has no `owners`, `users`,
`invoices`, `payments`, `products`, `inventory*`, `vaccinations`, `audit` or
`outbox` — and no place for staff PIN hashes. Once the sidecar accepted a push,
`saveState` returned early and the full document was never written, so owner
edits, staff changes and invoices could silently disappear on the next launch
(the loader correctly rejects the sidecar's partial document via
`isClinicState`, so it falls back to a stale `clinic_state` row).

## Decision

Write the complete `ClinicState` JSON to the Rust-managed `clinic_state` row on
every save, then push the same document to the sidecar as a **projection** for
cloud sync.

- `state_save_command` is the authoritative write; its failure is logged but
  does not block the sidecar update.
- The sidecar keeps extracting the entity envelopes it understands from the
  document and draining the outbox; it never becomes the loader's source of
  truth for the whole document.
- `loadState` continues to prefer the sidecar only when its response satisfies
  `isClinicState` (full document); otherwise it loads the Rust document.

## Consequences

- Owner/user/invoice/PIN data now survives restarts, and backups (MVP-08) can
  copy a single self-contained JSON document.
- Cloud sync still receives the subsets it supports; unsupported entities stay
  local until the backend grows them.
- If the sidecar later models the full document, the write order can be
  revisited — the `isClinicState` guard makes that safe either way.
