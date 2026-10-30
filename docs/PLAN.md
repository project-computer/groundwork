# Vet Clinic Management Platform — Execution Plan (Adapted to Current Stack)

> This plan is adapted to the codebase that already exists in this repo.
> Stack: **Go 1.25 + Fiber v3 + pgx v5** backend, **React 19 + Vite 8 + TypeScript** frontend,
> **PostgreSQL 18**, **Docker Compose + Nginx**, **pnpm** for the frontend.

---

## 1. Purpose

Build a vet clinic management system that:
- Is easy for vets and front-desk staff to use.
- Keeps medical history and images (X-ray, lab, ultrasound) for many years without loss.
- Has direct, fast support with clear SLA.
- Can migrate old data and images safely.
- Can be developed by multiple agents in parallel with minimal conflicts.

This file is the single source of truth for parallel execution.

---

## 2. Business Goals & Success Metrics

| Area | Goal | Metric |
|---|---|---|
| Business | Open/expand clinic, control cost, increase revenue | Break-even within plan |
| Product | Vets open years of history fast | Search history ≤ 3 seconds |
| Product | Images never lost | 0 image loss after migration |
| Dev/Production | Stable system | Uptime ≥ 99.9% |
| Support | Direct contact, fast fix | P1 response ≤ 30 min |
| Migration | Old data + images complete | 100% validated records and images |
| UX | Staff trainable quickly | Training in 1–2 days |

---

## 3. Current State (What Already Exists)

The plan is written against this reality — do not re-implement what is done.

### Already built
| Area | Status | Where |
|---|---|---|
| Auth: login, JWT access+refresh, logout, change password, profile | ✅ Done | `backend/internal/handlers/auth_handler.go`, routes in `cmd/api/main.go` |
| Users CRUD, roles: `admin / veterinarian / receptionist / pharmacist` | ✅ Done (role = string on `users`) | `users` table, `internal/middleware/auth.go` |
| Pets CRUD + search + status filters + per-pet history | ✅ Done | `patient_handler.go`, `pets` table |
| Appointments: book, today list, check-in (creates visit), cancel | ✅ Done | `appointment_handler.go` |
| Visits: OPD/IPD workflow — vitals, exam, diagnosis, treatment, medications (JSONB steps) | ✅ Done | `visit_handler.go`, `visits` table |
| Queue kanban (Waiting → In Examination → Done) | ✅ Done (frontend) | `frontend/src/pages/Queue.tsx` |
| Bills: create from visit, mark paid, print | ✅ Done | `bill_handler.go`, `bills` table |
| Prescriptions: generate from visit, print Rx | ✅ Done | `prescription_handler.go` |
| Dashboard: stats + revenue chart | ✅ Done | `dashboard_handler.go` |
| Audit log table | ⚠️ Schema only — not wired | `audit_logs` table |
| `visit_images` table | ⚠️ Schema only — no upload endpoint | `visit_images` table |
| Docker Compose (Postgres 18 + API + Nginx frontend), Makefile | ✅ Done | `compose.yaml`, `Makefile` |
| SQL migrations (up/down) + seed | ✅ Done | `backend/migrations/`, `backend/scripts/seed.sql` |

### Gaps (drive the workstreams below)
- ❌ No CI/CD (no `.github/`)
- ❌ No tests (zero `_test.go`, no frontend tests)
- ❌ Owners denormalized onto `pets` (`owner_name`, `owner_phone` columns) — no `owners` table
- ❌ No microchip, allergy, chronic-condition fields
- ❌ No inventory (products, stock movements) — bills are free-form JSONB items
- ❌ No image upload endpoint or object storage
- ❌ No LINE/email notifications
- ❌ No Redis / event bus
- ❌ No audit-log middleware
- ❌ No monitoring/backup/DR
- ℹ️ UI library is **Primer React** (`@primer/react` + `@primer/primitives` + styled-components). The README previously said shadcn/ui + TailwindCSS — that was stale and has been corrected. All new frontend work must use Primer components and Primer design tokens (no raw hex colors, no other component library).
- ℹ️ 2026-09-27 backend cleanup: dead `opd_records`/`ipd_records` tables dropped from migration `000001` (superseded by `visits.type`; pre-launch schema, rebuilt via docker-entrypoint / `make db-reset` — the append-only migration rule applies from first staging deploy onward). `GET /visits/queue` endpoint added; dashboard raw SQL moved into `DashboardRepository`/`DashboardService`.

---

## 4. MVP Scope

### Must-have
- Owner as first-class entity (normalize from `pets`) + pet + microchip + allergy/chronic disease
- Medical timeline (multi-year) viewable during exam
- SOAP/diagnosis/treatment/prescription/vaccine *(visit workflow exists; add vaccine + timeline)*
- Billing *(exists)*, receipt *(exists)*, inventory + stock deduction *(new)*
- Search by pet name, owner phone, microchip, HN *(exists for name/phone; extend)*
- Attach X-ray, lab, ultrasound, photos to visit *(new — table exists)*
- Automatic backup + separate image storage *(new)*
- LINE notification for appointments/vaccines *(new)*
- Multi-user + RBAC + audit log *(users/roles exist; add permission checks + wire audit)*
- Data migration from old system *(new)*

### Should-have
- Multi-branch basic *(schema hint exists via `clinics` table; wire `clinic_id` scoping)*
- Reports: doctor, stock, vaccine due *(revenue exists; extend)*
- Tablet/mobile/desktop responsive
- Export all data
- RPO ≤ 1 hour, RTO ≤ 4 hours

### Nice-to-have
- Owner portal/app
- AI summary of history
- Integrate lab/X-ray machines
- Boarding/grooming module

### Non-Goals (MVP)
- Microservices
- AI diagnosis
- Full multi-branch complex logic
- All device integrations

---

## 5. Architecture & Tech Stack (Locked to Current Code)

| Layer | Choice | Note |
|---|---|---|
| Frontend | **React 19 + TypeScript + Vite 8** SPA (not Next.js) | `frontend/`, entry `src/main.tsx`, routing moves to `src/app/router.tsx` (§6b) |
| UI kit | **Primer React** (locked — no shadcn/ui, no Tailwind) + lucide-react + Recharts | v36 — styled-components is a required peer dep. Design tokens from `@primer/primitives`, `ThemeProvider` in `src/app/providers.tsx`. App code must not import styled-components directly (only Primer's `sx` prop) |
| State/data | **TanStack Query 5** + native **fetch** via `apiFetch()` (no axios) + react-hook-form + **zod** | TanStack Query owns server state (cache, dedupe, retry, invalidation); `shared/api/client.ts` owns the HTTP layer; hooks per feature: `src/features/<domain>/api.ts` (§6b) |
| Lint | **oxlint** | `make lint-ts` (root Makefile) |
| Package manager | **pnpm** | |
| Backend | **Go 1.25 + Fiber v3** (not NestJS/Laravel) | `backend/cmd/api/main.go` |
| Backend layers | handlers → service → repository → models | strict layering, one file per entity |
| DB access | **pgx v5** (raw SQL, no ORM) | |
| Config | **viper** (`.env`) | `backend/internal/config/config.go` |
| Validation | **go-playground/validator** | |
| Auth | JWT (`golang-jwt/v5`) + bcrypt + role middleware | |
| Database | **PostgreSQL 18** | UUID ext enabled; current PKs are SERIAL |
| Migrations | Plain SQL `NNNNNN_name.up.sql` / `.down.sql` in `backend/migrations/` | applied via `Makefile` |
| Cache/Queue | **Redis — Phase 2 only.** Until then, in-process events + Postgres `notifications` table | Fiber runs a single binary; don't add Redis before there's a need |
| Image Storage | **MinIO (S3-compatible)** in `compose.yaml`; AWS S3 in prod | objects never in Postgres |
| Infra | Docker Compose now; single VPS acceptable for launch | no Kubernetes |
| CI/CD | GitHub Actions (to create) | |
| Monitoring | Sentry (Go + JS SDKs), UptimeRobot; Grafana/Prometheus optional Phase 3 | |
| Notification | LINE Messaging API (OA) + SMTP email fallback | Go HTTP client, no SDK dependency needed |

**Pattern:** Modular monolith in one Go binary — keep it. Add packages under `internal/`, never split services.

---

## 6. Repository Structure (Actual — use this, not `/apps`)

```
/VET
  /frontend                 # React 19 + Vite SPA (pnpm) — structure in §6b below
  /backend                  # Go 1.25 + Fiber v3
    /cmd/api                # entry point
    /internal
      /handlers             # HTTP handlers (per entity)
      /service              # business logic
      /repository           # pgx queries
      /models               # structs + JSON shapes
      /middleware           # auth, cors, logger (+ audit: new)
      /utils                # jwt, password, response, db
    /migrations             # SQL up/down
    /scripts                # seed.sql
  /docs                     # PLAN.md, API.md, ERD.md, MIGRATION.md, RUNBOOK.md
  /infra                    # (new) backup scripts, monitoring config
  /scripts                  # (new) /migration scripts for old data
  compose.yaml
  Makefile
```

**Do not** restructure into a pnpm/turborepo `/apps`+`/packages` monorepo. The Go module and the Vite app are independently built and versioned; shared API types live in:
- Backend: `internal/models`
- Frontend: `src/shared/api/` types + zod schemas (per feature)
- Contract truth: `docs/API.md` (keep in sync manually — it's small enough)

---

## 6b. Frontend Folder Structure (Target)

The app is medium-sized, so the current flat layout (`components/ hooks/ lib/ pages/`) is replaced with a **feature-based structure**. Rules are enforced by convention + lint; the dependency direction is one-way:

```
app → pages → features → shared        (never backwards, features never import features)
```

```
frontend/src/
  app/                          # wiring only — no business logic
    providers.tsx               # QueryClientProvider + ThemeProvider + AuthProvider
    router.tsx                  # route table + ProtectedLayout (from App.tsx)
    layout/
      app-sidebar.tsx
      mobile-nav.tsx
  shared/                       # cross-cutting, domain-agnostic
    api/
      client.ts                 # fetch wrapper: apiFetch<T>() (auth header, 401 refresh-once, ApiError), withQuery()
      types.ts                  # response envelope, PaginationMeta (mirrors backend utils/response.go)
    lib/                        # formatters: date, currency, phone
    ui/                         # small generic composites over Primer: PageHeader, EmptyState, StatusBadge
  features/                     # one folder per domain — self-contained
    auth/
      api.ts                    # login, me, refresh queries/mutations
      AuthContext.tsx           # (from lib/auth.tsx)
    patients/
      api.ts                    # usePatients, useCreatePatient, usePetHistory…
      types.ts                  # Pet, Owner types + zod schemas
      components/               # PatientForm, PatientTable, OwnerPicker, PatientTimeline
    appointments/
      api.ts / types.ts / components/
    visits/
      api.ts / types.ts / components/   # VisitDetail sections split out of the 411-line page
    billing/
    prescriptions/
    dashboard/
    queue/
  pages/                        # thin route entries — compose feature components
    DashboardPage.tsx
    PatientsPage.tsx
    AppointmentsPage.tsx
    VisitsPage.tsx
    VisitDetailPage.tsx
    QueuePage.tsx
    MedicalRecordsPage.tsx
    BillingPage.tsx
    PrescriptionsPage.tsx
    LoginPage.tsx
```

### Migration mapping (from current code) — ✅ executed 2026-09-27; build + lint verified
| Now | Goes to |
|---|---|
| `App.tsx` (router + ProtectedLayout) | `app/router.tsx` + `app/providers.tsx` |
| `components/app-sidebar.tsx`, `mobile-nav.tsx` | `app/layout/` |
| `lib/api.ts` (axios instance) | `shared/api/client.ts` + `shared/api/types.ts` |
| `lib/auth.tsx` | `features/auth/AuthContext.tsx` + `features/auth/api.ts` |
| `hooks/use-queries.ts` (one 218-line file, all domains) | split per domain → `features/<domain>/api.ts` |
| `pages/*.tsx` | rename to `*Page.tsx`, thin out: data hooks from feature `api.ts`, heavy JSX → `features/<domain>/components/` |

### Rules for all agents
1. **Import paths** use the existing `@/` alias: `@/features/patients/api`, `@/shared/api/client`.
2. **Features never import from other features.** Shared logic goes up into `shared/`.
3. **Pages only** appear in `app/router.tsx`. A page file imports from 1–2 features and renders — if it grows past ~150 lines, push components down into the feature.
4. **React Query keys** are owned by the feature's `api.ts` and exported from it; no inline `useQuery` in pages.
5. **Types + zod schemas** per feature in `types.ts`; the response envelope lives only in `shared/api/types.ts`.
6. A new backend-facing workstream adds exactly one new `features/<domain>/` folder — this is the conflict-avoidance unit for frontend parallel work.

### Remaining frontend follow-ups (incremental, per rule 3)
- Upgrade `@primer/react` 36 → 38: v37+ uses CSS Modules and drops the styled-components peer dep entirely, so the styled-components dependency can then be removed (do the upgrade first, removal second). Check the v37 migration guide for removed components/prop renames — pages use `sx` heavily but no direct styled-components imports, so the surface should be small.
- `VisitDetailPage.tsx` is ~411 lines — split its sections into `features/visits/components/` next time it's touched.
- Add `types.ts` (entity types + zod schemas) per feature as workstreams touch each domain; today hooks are untyped (`apiFetch<T = any>`) — replace the `any` default with real entity types feature by feature.
- Client/UI state: none needed today (auth lives in `features/auth/AuthContext.tsx`, everything else is server state in TanStack Query). Add Zustand only when real client state appears (e.g. UI preferences, multi-step form state shared across pages).
- Production bundle is ~1.3 MB — add route-level code-splitting (`React.lazy` per page) when doing perf work.
- `shared/ui/` and `shared/lib/` don't exist yet — create them with the first cross-domain component/formatter.

---

## 7. Parallel Workstreams Overview

Workstreams are re-scoped against existing code. "Exists" items become **verify + extend** tasks.

| Workstream | Agent | Depends On | Status of Base | Remaining Deliverable |
|---|---|---|---|---|
| WS0 Foundation | Agent 0 | — | Partial | CI (lint+test+build), docs (API.md, ERD.md), MinIO in compose, shared response/error conventions doc |
| WS1 Auth & RBAC | Agent 1 | WS0 | **Mostly done** | Permission table + RBAC middleware hardening, user admin UI polish |
| WS2 Owners & Patients | Agent 2 | WS0 | Partial | `owners` table + migration off denormalized columns; microchip, allergies, chronic; unified search |
| WS3 Medical Record | Agent 3 | WS0, WS2 | **Mostly done** | Vaccines, multi-year timeline API, history screen upgrade |
| WS4 Appointments | Agent 4 | WS0, WS2 | **Mostly done** | Reminder events, calendar view |
| WS5 Billing & Inventory | Agent 5 | WS0, WS3 | Partial | `products` + `stock_movements`, link bill items to products, auto stock deduction |
| WS6 Attachments & Images | Agent 6 | WS0 | Table only | MinIO upload/download/serving, thumbnails, backup + restore test |
| WS7 Notification | Agent 7 | WS0, WS4 | New | LINE OA + email, reminders, retries |
| WS8 Reporting | Agent 8 | WS0, WS3, WS5 | Partial | Doctor/stock/vaccine-due reports beyond dashboard |
| WS9 Audit & Security | Agent 9 | WS0, WS1 | Table only | Audit middleware on all writes, rate limiting, security headers, PDPA review |
| WS10 Infra & Monitoring | Agent 10 | WS0 | Compose done | Sentry, backups, DR runbook, staging deploy |

**Rule:** WS0 must complete before Phase 1 starts. WS1/WS2/WS4/WS6/WS10 can run fully in parallel (different files). WS3/WS5 wait for WS2's schema. WS7/WS8 are Phase 2.

---

## 8. Phase 0 — Foundation (Agent 0)

**Goal:** Make parallel work safe. Note: repo skeleton, DB, docker already exist — Phase 0 is smaller than a greenfield.

### Tasks
1. Create `docs/API.md` from **existing** routes (source: `cmd/api/main.go`) — document actual conventions (§9 below).
2. Create `docs/ERD.md` from **existing** schema (source: `backend/migrations/000001_init_schema.up.sql`).
3. Add GitHub Actions calling the root Makefile targets (`make lint`, `make test`).
4. Add MinIO service to `compose.yaml` + bucket bootstrap script.
5. Add first Go tests + Vitest setup so CI has something to run.
6. Create branch protection + PR template.
7. Write `docs/MIGRATION.md` skeleton (old-system field mapping comes in Phase 3).

### Definition of Done
- CI green on `main` with lint + test + build for both apps.
- `docker compose up` runs Postgres + API + frontend + MinIO.
- API.md and ERD.md match the code as it exists today.
- Every agent can find the response format and table list in docs.

---

## 9. API Contracts (Match Existing Code — do NOT change)

The plan's `{success, data, error}` envelope is **rejected** — the codebase already ships a different convention. All agents must follow what's in `internal/utils/response.go`:

**Success**
```json
{ "message": "string", "data": {} }
```

**Paginated**
```json
{ "data": [], "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } }
```

**Error**
```json
{ "error": "ERROR_STRING", "message": "Human readable" }
```

**Auth:** `Authorization: Bearer <token>` (already enforced by `internal/middleware/auth.go`).

**Routes:** grouped under `/api/v1` with kebab-simple nouns matching current style:
`/auth/*`, `/users`, `/patients`, `/appointments`, `/visits`, `/bills`, `/prescriptions`, `/dashboard`.
New resources follow the same pattern: `/owners`, `/products`, `/stock-movements`, `/attachments`, `/vaccines`, `/reports`, `/notifications`, `/audit-logs`.

**Verb convention (match existing):** `GET` list, `POST` create, `PUT` update (current code uses PUT, not PATCH), `POST /:id/<action>` for actions like `/checkin`, `/cancel`, `/complete`.

Any API change updates `docs/API.md` **in the same PR**.

---

## 10. Phase 1 — Parallel Workstreams

### WS1: Auth & RBAC (Agent 1) — *extend existing*
**Exists:** login/refresh/logout/password, users CRUD, role strings.
**Tasks**
- `permissions` + `role_permissions` tables; seed role→permission map.
- Extend auth middleware to check permissions per route (not just role existence).
- Admin UI for users (frontend page).

**DB:** `permissions`, `role_permissions` (additive migration `000002_...`).
**DoD:** every write route requires a permission; tests cover deny cases.

---

### WS2: Owners & Patients (Agent 2)
**Exists:** pets CRUD/search/history, but owner data is denormalized columns on `pets`.
**Tasks**
- Add `owners` table (name, phone, email, national_id, address, notes).
- Migration: dedupe owner columns → `owners` rows, backfill `pets.owner_id`, keep old columns read-only for one release then drop.
- Add to `pets`: `microchip`, `dob` (replace computed `age`), `sex`, `neutered`.
- New tables: `pet_allergies`, `pet_chronic_conditions`.
- Unified search endpoint: pet name, owner phone, microchip, HN — ≤ 3s (indexes + `pg_trgm` if needed).
- Frontend: owner detail page; patient form gains owner picker.

**DoD:** search ≤ 3s; zero data loss in backfill (counts match); existing pages still work.

---

### WS3: Medical Record & Timeline (Agent 3) — *extend existing*
**Exists:** visits with full OPD/IPD workflow, prescriptions, per-pet history endpoint.
**Tasks**
- `vaccines` table + `POST /api/v1/vaccines` (visit-linked) + vaccine-due query.
- Timeline API: `GET /api/v1/pets/:id/timeline` merging visits, prescriptions, vaccines, attachments into one chronological feed (cursor-paginated — must stay fast over 10+ years).
- Frontend: timeline view on patient page (virtualized list).

**DoD:** vet sees full multi-year history in one scroll during exam; ≤ 3s for 10-year-old patient.

---

### WS4: Appointments (Agent 4) — *extend existing*
**Exists:** booking, today list, check-in→visit, cancel.
**Tasks**
- Calendar (week/month) view in frontend (use existing React Query hooks; no new deps beyond a calendar lib if needed).
- Emit `appointment.created` / `appointment.reminder_due` events (in-process channel → `events` table row; WS7 consumes).
- Statuses already exist — add `no_show`.

**DoD:** calendar usable on tablet; events persisted for WS7.

---

### WS5: Billing & Inventory (Agent 5)
**Exists:** bills with free-form JSONB `items`, payment status/method.
**Tasks**
- `products` (name, sku, category, unit, cost, price, reorder_level, is_active) + `stock_movements` (product, qty delta, reason, ref_visit, user).
- Migration: map distinct existing bill items → products (best effort, flag unmatchable).
- Bill creation: items reference `product_id`; on bill paid → automatic stock deduction (transaction).
- Receipt printing already exists — keep.
- Low-stock report hook for WS8.

**DoD:** paying a bill deducts stock atomically; concurrent bills can't oversell (row lock / `UPDATE ... WHERE qty >= n`).

---

### WS6: Attachments & Images (Agent 6)
**Exists:** `visit_images` table, no endpoints, no storage.
**Tasks**
- MinIO in compose (WS0); S3-compatible Go client (minio-go).
- Presigned-URL upload flow: `POST /api/v1/attachments/presign` → client uploads direct to MinIO → `POST /api/v1/attachments` records row.
- Thumbnail generation (Go image resize on upload worker).
- Serving via short-lived presigned GET; private bucket.
- Bucket layout: `clinic-{id}/pets/{pet_id}/visits/{visit_id}/{uuid}.{ext}`.
- Backup: nightly `mc mirror` to offsite; restore test script in `/infra/backup`.
- Lifecycle: originals immutable, versioned bucket.

**DoD:** upload X-ray (20MB+) works on clinic Wi-Fi; restore test passes with checksum counts; 0-loss verified.

---

### WS9: Audit & Security (Agent 9)
**Exists:** `audit_logs` table (unused).
**Known debt to address here (from 2026-09-27 backend audit):**
- Refresh tokens are stateless JWTs (7-day expiry, not stored server-side) — logout is a client-side no-op and stolen tokens cannot be revoked. Add a `refresh_tokens` table with rotation + revocation.
- The global Fiber error handler in `cmd/api/main.go` returns raw `err.Error()` in a different shape than the handler envelope — sanitize and standardize.
**Tasks**
- Fiber middleware: log all write requests + all medical-record reads (who, what, old/new values, IP, UA) → existing table.
- Rate limiting (fiber limiter middleware) on auth + search routes.
- Security headers middleware, CORS tighten for prod.
- PDPA checklist: consent field on owners, data-export endpoint, data-deletion procedure doc.
- Gosec + oxlint security rules in CI.

**DoD:** every medical record access queryable by pet + by user; security scan clean.

---

### WS10: Infra & Monitoring (Agent 10)
**Exists:** compose for dev, Dockerfiles, Makefile.
**Tasks**
- Prod compose (or single-VM systemd) with TLS (Caddy or Nginx + certbot).
- Sentry DSNs for Go + React.
- Nightly `pg_dump` to MinIO/offsite + restore drill script.
- UptimeRobot on `/health` (endpoint already exists).
- `docs/RUNBOOK.md`: down-recovery, restore steps, rollback, contacts.
- Staging environment (same compose, different host/env).

**DoD:** staging deploy works; restore drill executed; alerts reach the phone.

---

## 11. Phase 2 — Parallel (after Phase 1 core merges)

### WS7: Notification (Agent 7)
- LINE Messaging API: appointment reminder (T-24h), vaccine due, bill paid.
- `notifications` + `notification_templates` tables; worker loop in the same Go binary (goroutine + tick), retries with backoff, dead-letter status.
- Email (SMTP) fallback. `POST /api/v1/notifications/test` for QA.
- **DoD:** LINE message received on reminder; retry logic tested with LINE outage simulation.

### WS8: Reporting (Agent 8)
- `GET /api/v1/reports/revenue` (exists as dashboard/revenue — generalize with date range + group-by), `/reports/doctors`, `/reports/stock`, `/reports/vaccines`.
- SQL views or read-model queries; cache in-process 60s (Redis only if needed).
- **DoD:** numbers match manual SQL; dashboard ≤ 3s.

---

## 12. Coordination Rules for Agents

### Branch Strategy
- `main` = production-ready (protect it)
- `develop` = integration
- `feature/wsX-short-name` per workstream
- Migration files are append-only; **never edit an applied migration** — new file `000NNN_...`.

### File ownership map (conflict avoidance)
| Area | Owner |
|---|---|
| `cmd/api/main.go` (route registration) | WS0 creates a per-workstream `RegisterRoutes(r)` pattern so agents add routes in **their own** file — do not all edit main.go |
| `internal/middleware/` | WS9 (auth middleware changes coordinated with WS1) |
| `internal/utils/response.go` | WS0, frozen after Phase 0 |
| `docs/API.md` / `docs/ERD.md` | append-only per PR |
| `compose.yaml` | WS0 then WS10 |
| Frontend `src/shared/api/client.ts` | `apiFetch()` config frozen after WS0; each WS adds its own `features/<domain>/` folder (§6b) |

### PR Rules
- One workstream per PR; CI must pass; docs updated in same PR.
- At least 1 review from another agent.
- DB changes: additive first, destructive columns dropped only in a later release.

### Conflict Resolution
- Same-file conflict → Agent 0 decides.
- Contract conflict → update `docs/API.md` first, then implement.
- Sync via `#dev-sync`.

---

## 13. Testing Strategy (Fit the Stack)

| Type | Tool | Target |
|---|---|---|
| Backend unit | `go test` + testify | coverage ≥ 70% on `service/` layer |
| Backend integration | `httptest` against Fiber app + Postgres (testcontainers-go) | all handler routes |
| Frontend unit | **Vitest** (+ React Testing Library) | hooks + critical components |
| E2E | **Playwright** | login → book → check-in → visit → bill → print |
| Load | k6 | 50–100 concurrent; search ≤ 3s |
| Security | gosec (CI) + OWASP ZAP (pre-launch) | no high issues |
| UAT | Vet + staff | sign-off before go-live |

---

## 14. Migration Plan (Old System → This Schema)

Target schema documented in `docs/ERD.md`; old-field mapping in `docs/MIGRATION.md`.

1. Extract from old system: owners, pets, visits, invoices, images.
2. Map old fields → new tables (`owners`, `pets`, `visits`, `bills`). Owner dedupe is the hard part (phones/names duplicated) — script in `/scripts/migration`, written in **Go** (reuses pgx + models) or Python, run against staging.
3. Clean: dedupe owners, normalize phones, fix duplicate HN.
4. Import to staging; images uploaded straight to MinIO with checksums.
5. Validate: record counts per table, image count + checksum match, chronological order of histories.
6. Dry run 2–3×; each run produces a validation report.
7. Cutover: freeze old → final import → verify → switch frontend to prod DB → go-live.
8. Rollback: keep old system frozen and readable for 30 days.

**Critical:** images live in MinIO only (never Postgres bytea), versioned bucket + nightly mirror.

---

## 15. Deployment & Production Readiness

- envs: dev (compose) / staging / prod (single VM + compose or systemd).
- TLS via Caddy/Nginx + certbot.
- Nightly `pg_dump` + MinIO mirror to offsite; retention 30 days. RPO ≤ 1h achievable via WAL archiving if required.
- Sentry (Go + JS), UptimeRobot → LINE incident alert to support group.
- Rate limiting + security headers (WS9).
- `docs/RUNBOOK.md` + rollback = redeploy previous image tag (images tagged per release).

---

## 16. Support & SLA

| Level | Example | Response | Fix |
|---|---|---|---|
| P1 | System down, data risk | 15–30 min | 2–4 hrs |
| P2 | Cannot open history | 1 hr | 4 hrs |
| P3 | Minor feature broken | 4 hrs | 3 days |
| P4 | Feature request | 1 day | Monthly review |

**Channels:** LINE group + direct phone + ticket. **Owner:** 1 primary support person. Monthly incident report.

---

## 17. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Owner-dedupe migration corrupts data | dry runs + count validation + keep denormalized columns read-only until verified |
| Images lost | MinIO versioned bucket + restore drill |
| Vets reject system | existing UI is far along — demo early, iterate |
| Scope creep | MVP list above is frozen; change-request process |
| System down | monitoring + runbook + rollback by image tag |
| Vendor lock-in | Postgres + S3 API + plain Go — exportable anytime |
| Test debt (currently zero tests) | WS0 adds CI + first tests; every WS PR must add tests or CI fails the trend |

---

## 18. Milestones & Timeline

| Phase | Week | Milestone |
|---|---:|---|
| 0 | 0–1 | CI + docs + MinIO in compose |
| 1 | 1–6 | WS1/2/3/4/5/6/9/10 in parallel |
| 2 | 7–9 | WS7 notifications, WS8 reports, E2E suite |
| 3 | 10–11 | Migration dry runs, UAT |
| 4 | 12–13 | Prod deploy, training, go-live |
| 5 | 14+ | Hypercare + iteration |

(Shorter than the original plan: auth, patients, visits, appointments, billing, prescriptions, dashboard, docker already exist.)

**Solo dev:** 2–3 months. **2–4 devs/agents:** 6–8 weeks.

---

## 19. Definition of Done (Global)

- Code reviewed; tests added; CI green.
- `docs/API.md` + `docs/ERD.md` updated in the same PR.
- Deployed to staging.
- No critical bugs; feature-flag anything incomplete.
- Migration-relevant changes validated by a dry run.

---

## 20. Agent Checklist

- [ ] Read `docs/PLAN.md` (this file)
- [ ] Read `docs/API.md` — follow **existing** response format (§9), PUT not PATCH
- [ ] Read `docs/ERD.md` — check existing tables before adding any
- [ ] Check dependencies in §7 — do not rebuild what "Exists"
- [ ] Create `feature/wsX-...` branch from `develop`
- [ ] Migrations append-only, additive
- [ ] Routes registered via your workstream's own route file
- [ ] Write tests (backend: service + httptest; frontend: Vitest)
- [ ] Update docs, open PR into `develop`
- [ ] Notify `#dev-sync` if a shared contract changed

---

**End of Plan.**
