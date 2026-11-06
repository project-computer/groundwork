# 0020 — The sidecar loopback API requires a per-launch secret

- Status: accepted
- Date: 2026-11-06
- Amends: 0010 (adds an authentication requirement to the loopback API)

## Context

The sidecar listens on `127.0.0.1:<random port>` and serves `GET/PUT /state`
to any caller — every endpoint is unauthenticated. Any process running as the
same user can read or replace the clinic document, including staff PIN hashes.
A random port is not a defence: it is discoverable by scanning localhost. The
external offline-MVP plan reviewed on 2026-11-06 made the same point
("bind only to 127.0.0.1, use a randomly allocated port and a per-launch
secret").

## Decision

The Tauri shell generates a fresh random secret (≥ 128 bits) on every launch
and passes it to the sidecar at spawn (environment variable). The sidecar
refuses to serve without it:

- `/healthz` stays unauthenticated — it leaks nothing and is the readiness
  probe the shell already consumes via the stdout announcement.
- Every other endpoint requires the secret in a request header; a wrong or
  missing secret returns 401 and is logged.
- The shell exposes the secret to the webview through a new command paired
  with `backend_url`; `backend.ts` attaches it to every sidecar request.
  This is the only new transport touchpoint — the restricted-imports rules
  (UI never reaches transports) are unchanged.
- A sidecar started without a secret, or a webview that cannot obtain one,
  is a fatal pairing failure: the shell treats it as the existing
  sidecar-unavailable case and the ADR-0012 adapter order applies (Rust
  fallback, then localStorage on web).

Keep the current CORS posture unchanged; the secret is additive and does not
depend on origin checks.

## Consequences

- Shell and sidecar only work as a matched pair. Mixing an old sidecar
  binary with a new shell fails closed (401 on every call → fallback
  adapter), which is the safe direction for a medical record.
- Tests follow the languages: a Go middleware unit test (accept with secret,
  deny without, deny wrong, `/healthz` exempt), a Rust command test, and a
  `backend.ts` header test — all three already run under `make test`.
- The web/browser target is unaffected: it has no sidecar and keeps the
  localStorage adapter.
