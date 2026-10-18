# 0006 — Zod for input validation

- Status: accepted
- Date: 2026-10-16

## Context

Forms and command inputs need shared, testable validation on every platform.

## Decision

Zod v4 in `src/validation/`. Schemas validate create/update inputs for
owners, pets, and appointments. Inferred TS types are the single source for
input shapes.

## Consequences

- Validation runs before any repository call; DB constraints are the second
  line of defense, not the first.
