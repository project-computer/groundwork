# Sidecar loopback API requires a per-launch secret (ADR 0020)

- Status: **landed 2026-11-06.** Middleware + fail-closed startup
  (`internal/api/server.go`), shell secret generation + `backend_secret`
  command (`src-tauri/src/lib.rs`), header transport + degraded pairing
  (`lib/vet/backend.ts`). Tests: `server_test.go` (auth cases, healthz
  exempt, empty-secret fail-closed, CORS allow-list), `backend.test.ts`
  (header attach), `lib.rs` unit test (secret uniqueness).

## What to build

Rust shell (`apps/clinic/src-tauri`):

- Generate a ≥128-bit random secret (hex) at sidecar spawn, pass it as the
  `VETCARE_LOOPBACK_SECRET` environment variable to the child process.
- New Tauri command paired with `backend_url` that returns the secret to the
  webview (in-process value only; never persisted, never logged).
- If the sidecar exits and is relaunched, generate a fresh secret per launch.

Sidecar (`apps/sidecar`):

- Read the secret from the environment; refuse to serve business endpoints
  when unset (log and exit non-zero — fail closed, the shell already handles
  a dead sidecar).
- Middleware on every route except `GET /healthz`: require the secret in the
  `X-VetCare-Loopback-Secret` header; constant-time compare; 401 otherwise,
  logged without the header value.

Frontend (`apps/clinic/src/lib/vet/backend.ts`):

- Fetch the secret via the new command and attach the header to every sidecar
  request. This stays inside the existing transport seam — no other file
  gains transport imports.

Tests: Go middleware unit test (accept with secret, deny missing/wrong,
`/healthz` exempt), Rust command test, `backend.ts` header test.

## Acceptance criteria

- [ ] Sidecar started without the secret does not serve `/state` or `/sync/*`.
- [ ] Requests without or with a wrong header get 401 on all routes but `/healthz`.
- [ ] `curl /healthz` still works unauthenticated (readiness probe unchanged).
- [ ] UI loads and saves a document end-to-end with the secret in place
      (existing store/persistence tests still green).
- [ ] The secret is never written to disk or logs.
- [ ] `make lint` and `make test` pass (Go + Rust + TS).

## Blocked by

- Nothing — independent.

## Progress (2026-11-06)

- **Sidecar — done.** `main.go` reads `VETCARE_LOOPBACK_SECRET` and exits
  non-zero when empty; `internal/api` middleware enforces it on every route
  but `/healthz` (constant-time compare, 401 logged without the header
  value). Covered by `internal/api/server_test.go` (accept / deny missing /
  deny wrong / `/healthz` exempt / fail-closed when unset).
- **Rust shell — done.** `generate_secret()` (two UUIDv4s, 64 hex chars,
  ~244 bits) is generated per launch in `spawn_sidecar`, passed through the
  environment, stored on `Sidecar` and returned by the new
  `backend_secret` command; the fallback in-process path keeps `None`.
  Unit test pins length/charset/uniqueness.
- **Frontend — done.** `backend.ts` discovers the secret via
  `backend_secret` alongside the URL and attaches
  `X-VetCare-Loopback-Secret` to every sidecar request (`request` and
  `runSync`); header covered by `__tests__/backend.test.ts`.

**Shipped 2026-11-06.** Acceptance: all criteria verified — Go middleware
tests, Rust unit test, TS header test, `/healthz` open, secret never
persisted or logged.
