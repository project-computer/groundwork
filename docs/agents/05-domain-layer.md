# Agent 05 — Domain Layer + Repository Interfaces

Read `00-shared-context.md` first. Requires agent 01. Independent of 02–04.

## Goal

Create `packages/domain` (and `packages/validation`) with pure TypeScript
domain types, business rules, Zod validation, and repository interfaces —
zero framework imports.

## Tasks

1. `packages/domain/package.json` (name `@vet/domain`, type module, TS
   source — either build-free with `"exports"` pointing at `.ts` consumed
   via the workspace + Vite, or a minimal `tsc` build; choose the simpler
   and document it). Add `vitest`, `typescript` as dev deps for its tests.
2. Types (per plan §5): `Owner`, `Pet`, `Appointment`, `Visit`,
   `MedicalRecord`, `ProductOrService`, `VisitItem`, `Payment`.
   Shared primitives: `Entity` base (`id`, `created_at`, `updated_at`),
   `Money` = `{ amountMinor: number; currency: "THB" }`,
   `Weight` = `{ value: number; unit: "kg" | "g" }`,
   `Timestamp` = branded UTC ISO string type.
3. Status enums + allowed-transition tables (throw on invalid):
   - Appointment: `scheduled -> checked_in | cancelled | no_show`,
     `checked_in -> completed`.
   - Visit: `open -> completed | cancelled`.
   - Payment: `pending -> paid | failed`.
   Pure functions: `canTransitionAppointment(s, t)`,
   `transitionAppointment(...)`, same for Visit/Payment.
4. Billing math (pure, tested): `computeLineTotal(qty, unitPriceMinor,
   discountMinor)`, `computeInvoiceTotals(items)` — integer arithmetic
   only; throw on overflow/negative results.
5. `packages/validation`: Zod schemas for create/update inputs of each
   entity (owner, pet, appointment minimum for Phase 2 readiness).
6. Repository interfaces (`packages/domain/src/repositories.ts`):
   `OwnerRepository`, `PetRepository` exactly per plan §6, plus
   `AppointmentRepository` with `listByDate(dateUtc)`, `create`, `update`.
   Interfaces only — no implementations (agent 07 implements over Tauri).
7. Unit tests: transitions (valid + invalid paths), billing rounding and
   negative-input rejection, Zod schema accept/reject cases.

## File boundaries

ONLY: `packages/domain/**`, `packages/validation/**`,
`apps/clinic/package.json` (add workspace deps on both packages).

## Verification (run and report output)

```
pnpm -r --filter '@vet/domain' --filter '@vet/validation' test
pnpm -C apps/clinic build
pnpm -C apps/clinic lint
```

## Notes

- No React, no Tauri, no SQL imports — verify by grepping imports before
  reporting done.
- Do not commit.
