# 0024 — REST-authoritative credentials with a document fallback

- Status: accepted
- Date: 2026-11-12
- Amends: 0011 (staff PIN auth), 0023 (the offline-MVP normalized backend)

## Context

The document model verifies staff PINs locally: PBKDF2 hashes inside the
clinic document, checked by the lock screen (ADR 0011). The normalized REST
backend (ADR 0023) verifies credentials server-side: bcrypt hashes in the
`users` table, bearer sessions. During the phase-4 transition both stores
exist, and the importer deliberately carries no PIN material — PBKDF2 cannot
be verified by bcrypt, so imported accounts arrive hashless ("PIN reset
required").

The frontend now needs one credential path that is honest about who holds
the authoritative hash for a given member.

## Decision

The lock screen delegates to the store's `signInWithPin(member, pin)`
orchestration (no UI surface touches transports):

1. **REST-first when the member is known there.** The store asks persistence
   (`restVerifyMember`) to fetch the pre-auth staff directory
   (`GET /api/v1/users`, loopback-secret-gated, no bearer, no PIN material)
   and match the member by **id** — the importer preserves ids, so ids are
   the stable join. A match is authoritative: `POST /api/v1/auth/login` with
   the directory username; `invalid_credentials` means denied, and the
   document hash is never consulted for REST-known members.
2. **Document fallback otherwise.** REST unreachable, or the member absent
   from the directory (document-only members, locally created staff) → the
   document's PBKDF2 hash verifies as before. Same degraded-path philosophy
   as the ADR-0012 adapter order.
3. **Session state stays in the document.** On success the bridge dispatches
   the plain `signIn` for the member id; RBAC keeps reading the document's
   role matrix (`format.can`). The REST bearer token lives in sessionStorage
   for API calls; the document session is the UI's source of truth. Role
   vocabulary maps one-to-one (importer: `reception→receptionist`,
   `vet→veterinarian`), so the two stores agree post-import.
4. **PIN-less members walk in as before.** A member with no document PIN and
   no REST account signs in directly — unchanged ADR-0011 behaviour.

## Consequences

- Imported staff cannot sign in through REST until an admin sets a bcrypt
  PIN there (empty hash); the importer reports each as "PIN reset required".
  Staff/PIN management endpoints are the follow-up (issue 0019) — until then
  such members are locked out of REST auth by design, never silently waved
  through.
- When vetcare is down, document PINs still unlock the app: availability
  beats strictness for a local-first clinic tool, and the document hash
  remains a credential the clinic set itself.
- A REST-known member's stale document hash is ignored — there is exactly
  one authoritative store per member, decided by directory membership.
- `GET /api/v1/users` exposes usernames pre-auth to loopback callers holding
  the per-launch secret. That is the same audience the document lock screen
  already exposes member names to; no secrets are included.
