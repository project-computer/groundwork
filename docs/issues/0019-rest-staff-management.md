# REST staff & PIN management (admin)

## What to build

The auth bridge (ADR 0024) makes REST credentials authoritative for members
in the staff directory — but today there is no way to set or reset a REST
bcrypt PIN, so imported staff ("PIN reset required" per the importer report)
stay locked out of REST auth, and new REST-side staff cannot be created.
Admin-gated staff management closes that gap.

Sidecar (`server/internal/offlineapi/api/staff.go` + handlers):

- `GET /api/v1/users/{id}` — admin-only, full profile (id, username, name,
  active, roles).
- `POST /api/v1/users` — admin-only; create a member (name, username, role,
  active default on, optional initial PIN).
- `PATCH /api/v1/users/{id}` — admin-only; rename, change role, activate /
  deactivate.
- `PUT /api/v1/users/{id}/pin` — admin-only (self-service later); sets or
  resets the bcrypt PIN. The response confirms reset; the old hash is
  overwritten, not versioned.
- Every mutation commits an audit event (`staff.created`, `staff.updated`,
  `staff.pin_reset`, `staff.activated` / `staff.deactivated`).

Frontend (after the backend lands):

- Staff & Permissions gains a REST-side mirror when the backend is
  configured: set/reset PIN actions call the new routes; the lock screen's
  "no PIN" walk-in stays for document-only members.
- The importer's "PIN reset required" warnings link to this flow.

## Acceptance criteria

- [ ] An imported member gets a REST PIN and can then sign in through the
      lock screen (bridge path, not document fallback).
- [ ] Deactivating a member blocks their next login attempt (401).
- [ ] Every staff mutation appears in `GET /api/v1/audit`.
- [ ] Non-admin callers get 403 on all staff mutations.

## Blocked by

- Nothing — the routes are independent; the frontend wiring follows.
