# Test infrastructure — Go (testify) + Vitest RTL + smoke tests per layer

## What to build

Add test runtimes to both halves of the stack: `stretchr/testify` for the Go server (`server/internal/...` with `*_test.go` siblings, runnable via `go test ./...`), and Vitest + React Testing Library + jsdom for the React client (`frontend/src/__tests__/...`), with a `test` script in `frontend/package.json`. Seed with one smoke test per existing layer:

- Go: `models/pet_test.go` (struct decode round-trip), `repository/pet_repository_test.go` (against a test DB or sqlmock), `service/patient_service_test.go` (mocks repo), `handler/pet_handler_test.go` (Fiber's `app.Test` mocks service).
- Frontend: `pages/Patients.test.tsx` (renders with stub query), `lib/api.test.ts` (axios mock returns fixture), `lib/auth.test.tsx` (AuthProvider token lifecycle).

The chosen test stack is unopinionated about DB strategy for Go (sqlmock vs testcontainers vs real DB) — pick whichever is fastest to bootstrap. Document the choice in `AGENTS.md` or this slice's follow-up issue.

## Acceptance criteria

- [ ] `go test ./server/...` exits 0 from repo root.
- [ ] `pnpm --filter frontend test` (or equivalent `pnpm test`) exits 0.
- [ ] `Makefile` (or CI step) runs both as a single target, e.g. `make test`.
- [ ] No flakiness; tests do not depend on the running dev server (`localhost:8080`) or any external services.
- [ ] At least one smoke test per layer × per stack exists (8 minimum).

## Blocked by

None — can start immediately.
