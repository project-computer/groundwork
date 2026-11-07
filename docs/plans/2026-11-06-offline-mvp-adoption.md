# Offline-MVP adoption — literal execution plan

- Date: 2026-11-06
- Source: external "VetCare — Technical implementation plan & engineering
  backlog" (10-epic offline-first MVP).
- Decision: [ADR 0023](../decisions/0023-offline-mvp-normalized-architecture.md)
  supersedes ADR 0012; the plan is the target architecture.
- Supersedes: [2026-11-06 reconciliation](2026-11-06-offline-mvp-plan-reconciliation.md)
  (that document remains as the record of what was rejected and why).
- Layout amendment (same day): the plan's `services/api` tree was **not**
  adopted — per the owner, adopt the plan's content, not its folder
  structure. The REST backend lives in the existing `server` module as
  `server/internal/offlineapi/` with the `server/cmd/vetcare` binary
  (`make api`); `apps/clinic` keeps its name and the legacy sidecar keeps
  running until phase 4.

## Target layout (amended)

```
server/
├── cmd/vetcare/            # offline REST entrypoint (loopback, per-launch secret)
├── internal/offlineapi/
│   ├── api/                # HTTP handlers + middleware
│   ├── auth/               # PIN hashing (bcrypt), session tokens, roles
│   ├── db/                 # sqlc output
│   ├── logging/            # rotating file logger
│   ├── migrations/         # embedded, plan groups 001–010
│   └── queries/            # sqlc sources
└── sqlc.yaml               # sqlite engine, database/sql
```

The offline binary writes its own `vetcare.db` (distinct from the legacy
`clinic.db`) so both models coexist on disk until the phase-4 importer runs.

## Phases

| Phase | Scope | Exit criteria | Status |
| --- | --- | --- | --- |
| 1 | scaffold, migrations 001–010, sqlc, health + setup/login/logout + RBAC, owners, pets, weights | `go test ./...` green; `curl` exercises setup → login → create owner → create pet | **done 2026-11-06** |
| 2 | Appointments, consultations, prescriptions, medication catalog | APT-01…09, MED-01…11, RX-01…06 covered by handlers/tests | **done 2026-11-06** |
| 3 | Services/invoices/payments, settings, audit, backups | BILL-01…10, SET-01…04, AUD-01…03, BKP-01…04 | **done 2026-11-07** — billing/settings/audit (`6d5fc53`) + backup endpoints (`1582e65`) |
| 4 | Frontend REST client + `clinic_state` importer; replace document store per feature | Full visit E2E against the REST backend; restart persistence | **importer done 2026-11-07** — `server/internal/offlineapi/clinicimport` + `server/cmd/import-clinic-state` (fresh-DB-only, all-or-nothing, tested against the pinned fixture's shape); frontend REST cutover still open |
| 5 | Delete document store, sync engine, legacy sidecar paths, update repo-structure docs | No references to `clinic_state` / `outbox` in runtime code | open |

## Phase 1 file map

- `server/cmd/vetcare/main.go` — CLI, loopback bind, per-launch secret,
  stdout announce, graceful shutdown (same contract the Tauri shell parses).
- `server/internal/offlineapi/migrations/0001…0010` — normalized schema (plan §5).
- `server/internal/offlineapi/queries/*.sql` — sqlc sources.
- `server/internal/offlineapi/db` — generated code.
- `server/internal/offlineapi/{api,auth,logging}` — server, middleware, PIN
  auth, rotating logs.

## Invariants kept from the current system

- Bind `127.0.0.1` only, random port, per-launch `VETCARE_LOOPBACK_SECRET`
  (ADR 0020), `X-VetCare-Loopback-Secret` header.
- Money is integer satang; timestamps are UTC ISO-8601; ids are UUIDv4 text.
- `VET_DB` selects the database path; the data dir also holds `logs/` and
  `backups/`.
- Migrations are embedded and applied at startup.
