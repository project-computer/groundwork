# 0005 — Money as integer minor units, UTC timestamps, UUID ids

- Status: accepted
- Date: 2026-10-16

## Context

Floating-point money causes rounding bugs; local-time storage causes sync
bugs; sequential ids complicate multi-device merge.

## Decision

- Money: integer minor units (satang for THB), `unitPriceMinor`,
  `amountMinor`, `lineTotalMinor`. All math in integers.
- Timestamps: UTC ISO-8601 strings (`createdAt`, `scheduledAt`, `paidAt`…).
- Ids: UUID v4 generated client-side (`crypto.randomUUID`), so records can be
  created offline and merged later.

## Consequences

- Currency display/formatting is a UI concern (`toFixed(2)` on major units).
- Default currency THB — confirm before pilot.
