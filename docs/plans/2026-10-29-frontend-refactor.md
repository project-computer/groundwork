# Frontend refactor — deepening the clinic app

- Date: 2026-10-29
- Source: architecture review of `apps/clinic/src` (exploration report + design
  grilling), aligned with the target deltas already recorded in
  `.agents/skills/repo-structure/REFERENCE.md`
- Status: executed 2026-10-29/30 — all phases (0–6) are done. Remaining
  open item: StaffView/TeamPanel form dedup (deliberately deferred). See the
  target deltas in `.agents/skills/repo-structure/REFERENCE.md` for the live
  state.

## Decisions locked at planning time

1. **Folder per View** — `features/vet/<view>/` with dialogs and component
   tests beside the View (not flat per-view files).
2. **`session.lastRejection`** is the dispatch rejection channel —
   [ADR-0015](../decisions/0015-dispatch-rejection-channel.md). No dispatch
   signature change; no silent no-ops.
3. **The reducer's role matrix wins** the RBAC divergence: `usePermission`
   is fixed to derive from it; veterinarians lose `inventory.write` UI.
4. **Pet → Patient / encounter → Visit renames ride the Phase 1 file moves**
   (state vars, field ids, nav label). CSS classes wait for Phase 6 to avoid
   screenshot churn mid-refactor.

Standing rule for every phase: **the skill docs update in the same PR as the
code** — `.agents/skills/repo-structure/SKILL.md` and `REFERENCE.md` must
describe the codebase that exists after the phase, not the one before.

Prerequisite: the working tree carries an **in-flight Tailwind class
migration** (semantic classes → utilities; `receipt.css`/`reports.css`/
`status.css` deleted). Land it before Phase 1 — the phases below build on
it: Phase 4 primitives use Tailwind token classes, and Phase 6's `pet-*`
sweep shrinks as semantic classes disappear.

## Phase 0 — Safety net & quick wins (~half day)

Reducer paths that Phase 2 changes are pinned by characterization tests
*before* anything moves (the interface is the test surface):

- `lib/vet/store.test.ts` (new, plain Node): current behaviour of
  `recordPayment` (settles trust), `refundPayment` reopen (753–755),
  `voidInvoice` netting (778), `walkIn`, `importCaseBundle` owner-by-phone
  matching (569–571), `restoreBackup` user fallback (234–238).
- Delete dead code: `receiveStock` action (store.tsx 101, 786–796 — dispatched
  nowhere), dead vars in views.tsx 138–139.
- `.oxlintrc.json`: add `@/lib/vet/seed` to the UI denylist — SKILL.md already
  claims this enforcement; make it true.
- Replace native `confirm()` on invoice void (clinic-shell 2177) with the
  standard dialog treatment; gate SettingsView demo buttons ("Simulate server
  offline", "Preview Cloud plan", views 642–650) behind a dev flag.

Verify: `pnpm -C apps/clinic lint:strict && pnpm -C apps/clinic test`.

## Phase 1 — Split the shell (C1 + partial C6)

Pure move, zero behaviour change. Guarded by the 14 App-level component tests
(they render `<App>` and are unaffected by file layout) plus e2e page specs.

```
features/vet/
  shell/                  shell.tsx (ClinicApp: nav, lock gate, RBAC gate,
                          view routing), notification-center.tsx, theme-toggle.tsx
  dashboard/  owners/     owners gets patient-dialog.tsx beside it
  consultations/          the 620-line View moves whole
  billing/                + receipt-dialog.tsx beside it
  inventory/  staff/      staff = merged StaffView + TeamPanel (the near-clone
                          pair: views.tsx 311–492 + workspace-dialog 426–574)
  schedule/  reports/  records/  settings/    from the existing *-view.tsx files
  workspace/              workspace-dialog minus the team panel
  lock-screen.tsx  pin-dialog.tsx  language-toggle.tsx  save-error-banner.tsx
```

- Each `index.tsx` exports one View; nothing else. The known
  setState-during-render quirk (clinic-shell 1349–1353) moves verbatim with a
  `// TODO(phase-3)` note — no logic edits during moves.
- Component tests move beside their View; new `inventory/` and
  `billing/receipt` get their first tests (currently untested).
- Renames riding the moves: `petName`→`patientName`, `pet-*` field ids →
  `patient-*`, nav "Owners & Pets" → "Owners & Patients", encounter→Visit in
  identifiers. Then `pnpm -C apps/clinic i18n:extract && i18n:compile`.

Doc sync: REFERENCE.md tree updated + "split clinic-shell" delta marked
**done**; SKILL.md pre-flight gains the folder-per-View rule.

## Phase 2 — Invariants into the reducer + rejection channel (C2)

TDD: every bullet below lands as a failing `store.test.ts` case first.

- `addPrescription` enforces the **stock floor** against InventoryLot
  on-hand (today the rule exists only in the Consultations form,
  clinic-shell 1366–1373 — the reducer has no check at all).
- `recordPayment` **computes `settles` itself** and rejects overpayment
  (today the caller decides, store 717–730 trusts it).
- **Refund headroom** and **void eligibility** get one formula each, in the
  reducer; UI hints read from them instead of recomputing.
- Case-import duplicate-token check lives only in the reducer (views 130–136
  copy of store 564–566 is deleted).
- `usePermission`'s matrix is replaced by derivation from the reducer's
  matrix (decision 3). Vets' Receive-stock/Dispense buttons disappear.
- `session.lastRejection: { code, message, at } | null` per ADR-0015;
  cleared on the next successful commit; rendered like SaveErrorBanner.
  UI guards become presentation (disabled buttons, hints) — never enforcement.

Doc sync: SKILL.md "Invariants belong in the reducer" gains the concrete rule
list + the `lastRejection` convention; REFERENCE.md delta marked **done**.

## Phase 3 — Read model beside the store (C3)

- `lib/vet/catalog.ts` — prescribable/billable catalog (replaces Billing's
  inline products+inventory merge, clinic-shell 1962–1968). Recorded delta.
- `lib/vet/selectors.ts` — pure derivations with one home each:
  `outstandingBalance` (today 3×), `vaccinationsOverdue` (today 3 different
  computations), `lowStockItems` (**with** the `reorderLevel > 0` guard —
  fixes the two-semantics bug at clinic-shell 2656 / reports 252),
  `notificationsWorklist` (from NotificationCenter 109–128).
- `lib/vet/report.ts` — the 357-line model leaves reports-view; translation
  happens at render (`globalI18n._` out of the pure model). Golden CSV test.
- Schedule slot math (schedule-view 11–106) → `lib/vet/schedule.ts` with Node
  tests (walk-in + drag-to-reschedule are untested today).

Doc sync: SKILL.md UI allowlist gains `@/lib/vet/selectors`,
`@/lib/vet/catalog`; REFERENCE.md tree + delta marked **done**.

## Phase 4 — Deep UI primitives (C4)

Aligned with [0008-ui-primitives](../decisions/0008-ui-primitives.md).

Landed in `components/vet/` rather than `components/ui/`: these shells
hardcode the clinic's existing `.modal*` / `.records-table` / `.stat-*`
hooks, so they belong beside `fields.tsx` and `date-picker.tsx`. They can
graduate to `components/ui/` when that CSS moves to semantic tokens (the
ADR's end state).

- `components/vet/modal.tsx` — backdrop, Escape, heading, close button and
  accessible name owned once (replaces 10 hand-rolled dialogs).
  `closeOnEscape={false}` for surfaces with a nested dialog.
- `components/vet/data-table.tsx` — `DataTable` (wrapper, header, empty
  state; 6 tables) and `StatCard` (3 surfaces).
- Call sites migrated in one sweep; markup is byte-identical, so screenshots
  did not change.

Deferred: StaffView/TeamPanel still duplicate the member form.
Focus trapping remains a gap — the shell keeps today's behaviour.

Doc sync: SKILL.md "UI primitives" section + REFERENCE.md phase-4 delta.

## Phase 5 — Sync seam (C5)

- `lib/vet/sync.ts` owns orchestration (`syncNow`, debounced push, 60s pull,
  connectivity reset — today ~130 lines inside the ClinicProvider,
  store 989–1117). The provider consumes the seam.
- `runSync` import leaves store.tsx (store 4 imports backend directly);
  transports reach it through the persistence seam, restoring the SKILL.md
  layering diagram to truth. Oxlint restriction extended so it stays that way.
- `backend.ts` gets interface tests beside it (persistence.ts already has
  the pattern).

Doc sync: SKILL.md layering diagram + REFERENCE.md "store.tsx has zero
transport/platform imports" claim becomes true again; delta marked **done**.

## Phase 6 — Vocabulary sweep & close-out (C6 remainder)

- CSS classes `pet-*` → `patient-*` across `styles/*.css` + classNames;
  refresh snapshots with `pnpm -C apps/clinic test:screenshot:update`.
- Retire CONTEXT.md's "Pet — legacy, being renamed in code" note.
- Final pass: `docs/architecture.md` module map; every REFERENCE.md delta
  this plan touched reads **done**.

## Sequencing & risks

- **Split before deepening**: Phase 1 is the only zero-behaviour-change
  phase and has the strongest existing safety net; every later phase then
  lands as small diffs in small files instead of edits to a 2,768-line file.
- **Phase 2 changes behaviour deliberately** (reducer rejects what it used
  to accept silently; vets lose two buttons). Characterization tests from
  Phase 0 document the before; new tests specify the after.
- **Phases 3–5 are independent** of each other once Phase 1 has landed;
  they can be re-ordered or interleaved.
- PR rule of thumb: one View folder per PR in Phase 1; one bullet per PR in
  Phase 2; skill-doc updates never in a separate PR.
