# Architecture alignment — refactor.md review

- Date: 2026-10-30
- Source: `refactor.md` (repo root, untracked) — a generic "Feature-Based
  Architecture with Layered UI Boundaries" recommendation — reviewed against
  the executed [2026-10-29 refactor](2026-10-29-frontend-refactor.md) and the
  layering the repo-structure skill already enforces.
- Status: executed 2026-10-30 — all phases (A–D) done. Every View is under
  the ~450-line trigger, all suites green (215/215, `lint:strict` and
  `make lint-ts` clean), the sibling-internals tripwire is live in
  `.oxlintrc.json` and verified in both directions. See the target deltas in
  `.agents/skills/repo-structure/REFERENCE.md`.

## Gap analysis — what the recommendation changes here

The recommendation's substance is already this repo's shape: folder per View,
shared UI without business knowledge, composition in the shell, import
boundaries enforced by oxlint. Verdict per ask:

| refactor.md asks | Repo today | Verdict |
| --- | --- | --- |
| Feature folders with public `index.ts` API | `features/vet/<view>/index.tsx` exports one View, nothing else | done |
| Shared UI owns presentation, not business | `components/ui` primitives + `components/vet` shells (Modal, DataTable, fields) | done |
| App composition separate from features | `app/App.tsx`, `main.tsx`, `features/vet/shell/` (nav, gates, view routing) | done |
| Import boundary table (app → features → shared/infra) | `.oxlintrc.json` `no-restricted-imports` overrides — UI→store, store→no-transport | done; one tripwire missing → Phase D |
| Features never import other features' internals | zero cross-View imports today; convention only | **Phase D** |
| Data fetching separate from presentation | store hooks + read-model (`lib/vet/{catalog,selectors,report,worklist,schedule}`) | done |
| Per-feature `components/ hooks/ services/ types/` scaffold | dialogs sit flat beside the View (owners, billing, records, staff already) | **Phase C** — by trigger, not by default |
| Focus-trapped dialogs (Radix) | Modal owns backdrop/Escape/heading; no trap, no focus restore | **Phase A** |
| `shared/ui` + `infrastructure/` taxonomy | `components/{ui,vet}` + `lib/vet/{store,persistence,backend}` + `platform/` | reject — same layering, already enforced |
| Router (React Router / TanStack Router) | single-shell Tauri app; Views switch in shell, no URL space | reject |
| TanStack Query / Zustand | one JSON document through the persistence seam; reducer + hooks are the state layer | reject |
| React Hook Form + Zod | invariants live in the reducer (ADR-0015); document shape guarded 3× and fixture-pinned | reject |
| Radix UI wholesale | Modal/DataTable/fields own those shapes on existing CSS hooks (ADR-0008) | adopt the behaviour, not the dependency |

## Decisions locked at planning time

1. **No taxonomy rename.** `components/` *is* the shared UI layer;
   `lib/vet/{store,persistence,backend}` + `platform/` *is* the
   infrastructure layer. The layering refactor.md draws is what oxlint
   already enforces; renaming folders would churn lint paths, skill docs,
   ADRs and every test import for zero behaviour change.
2. **Views earn subfolders by trigger, not by default.** A View gets
   extracted when its `index.tsx` crosses ~450 lines or grows a second
   dialog; `index.tsx` stays the composition root exporting only the View.
   refactor.md's four-subfolder scaffold is more structure than these Views
   need — hooks and services already live in `lib/vet/` read-model modules.
3. **Focus management lands in Modal once** — trap + restore — never per
   dialog. Radix adoption stays deferred to ADR-0008's end state (semantic
   tokens), evaluated against an already-correct Modal.
4. **`refactor.md` is absorbed by this plan.** The table above is the
   durable record; delete the root copy when this plan commits.

## Phase A — Modal focus management

- `components/vet/modal.tsx`: focus the dialog box on open, trap Tab and
  Shift+Tab inside it, restore focus to the opener element on close.
  Markup unchanged apart from `tabIndex={-1}` on the box — screenshots and
  the `.modal*` CSS hooks stay as they are.
- Keyboard-nav cases added beside `modal.component.test.tsx`.
- Verify: `pnpm -C apps/clinic lint:strict && pnpm -C apps/clinic test`.

## Phase B — StaffView / TeamPanel dedup (carried over)

The deferred item from the 2026-10-29 plan, now scoped. Both surfaces
repeat the add-member form (name/role, TeamPanel adds email) and the
member row actions (role select, sign-in, PIN, activate/deactivate) with
identical `hasPin` / self / active conditionals. Extract into staff/:

- `staff/member-form.tsx` — the fields + `addStaff` dispatch; TeamPanel
  keeps its workspace layout wrapper, StaffView its Panel.
- `staff/member-row-actions.tsx` — PIN / sign-in / deactivate buttons,
  parameterised by callbacks (StaffView routes sign-in through `signInAs`;
  TeamPanel through its props).

Pure extraction, same dispatches: `staff-overflow` and
`workspace-dialog` tests stay green unchanged.

## Phase C — split the oversized Views (trigger rule, applied today)

One PR per View, size order; pure moves; tests move beside what they test.

| View | lines | extraction (verified shapes) |
| --- | --- | --- |
| schedule | 724 | `WalkInForm` (line 692) to its own file; calendar grid out of the `ScheduleView` body |
| consultations | 631 | the single 613-line `Consultations` body: clinical record form, prescription panel |
| workspace | 480 | `ClinicPanel`, `AccountPanel`, `RolesPanel` (already separate consts) — one file each beside `WorkspaceDialog` |
| reports | 478 | CSV helpers (`csvCell`/`csvMoney`/row builder — pure) move to `lib/vet/report.ts`; view keeps every label |
| billing | 456 | payment / refund / void flows out of the `Billing` body (receipt dialog is already out) |

Below ~450 lines a View stays flat — the trigger, not this table, is the
rule that outlives the plan.

## Phase D — lint tripwire for sibling-View internals

~~Zero cross-View imports today~~ — planning-time claim, corrected in
execution: one existed (`workspace` → `../staff/team-panel`), resolved in
Phase B by re-exporting `TeamPanel` through staff's public index. The rule
below now meets zero violations. Deny reaching into a sibling View's folder
while keeping its public index importable — the shell composes Views
through `../reports`, `../schedule`, … which must stay legal:

```jsonc
// patterns addition — sibling View internals only (twelve Views)
{
  "group": [
    "../billing/*", "../consultations/*", "../dashboard/*",
    "../inventory/*", "../owners/*", "../records/*", "../reports/*",
    "../schedule/*", "../settings/*", "../shell/*", "../staff/*",
    "../workspace/*"
  ],
  "message": "Import the View's public API ('../<view>'), not its internals."
}
```

`../<view>` itself stays allowed — that *is* the public API — and
top-level residents (`../pin-dialog`, `../lock-screen`, …) are files, not
matched by `../<view>/*`.

## Sequencing & risks

- **A and B are independent small PRs** — land first; B de-risks C's
  staff/ moves.
- **C is mechanical.** The safety net is the component tests that moved
  beside each View on 2026-10-29 plus the e2e page specs. If a View's
  tests cannot survive an extraction unedited, the extraction is wrong.
- **D lands last**, against the final layout C leaves behind.
- Standing rule unchanged: skill docs update in the same PR as the code;
  each REFERENCE.md delta flips to **done** in the PR that lands it, and
  this plan's Status line is updated on completion.
