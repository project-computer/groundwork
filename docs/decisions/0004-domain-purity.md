# 0004 — Domain purity by convention

- Status: accepted
- Date: 2026-10-16

## Context

Business rules (status transitions, billing math) must survive platform
changes and be testable without a UI, database, or network.

## Decision

`src/domain/` contains types, transition tables, and billing math with zero
imports from React, Tauri, SQL, or HTTP. Simple interfaces + explicit
construction; no DI framework.

## Consequences

- Domain tests run in plain Node, no jsdom needed.
- Sync (Phase 5) will reuse these types and transition rules for conflict
  detection.
