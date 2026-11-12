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

- [x] An imported member gets a REST PIN and can then sign in through the
      lock screen (bridge path, not document fallback). — `PUT /users/{id}/pin`
      then login verified in `TestStaffManagement`; the frontend mirror is
      `persistence.restSetStaffPin`, wired through the store's `setMemberPin`
      (document commit first, best-effort REST mirror — ADR 0024).
- [x] Deactivating a member blocks their next login attempt (401). —
      `SetUserActive` + `DeleteSessionsByUser` (sessions die immediately),
      covered in `TestStaffManagement`.
- [x] Every staff mutation appears in `GET /api/v1/audit`. — `staff.created`,
      `staff.updated` (rename/role/activation), `staff.pin_reset`.
- [x] Non-admin callers get 403 on all staff mutations. — covered; the PIN
      route additionally allows self-service (the UI's `manage || isSelf`
      gate).

## Status — shipped 2026-11-12 (backend + PIN mirror)

- Routes: `GET/POST /api/v1/users`, `GET/PATCH /api/v1/users/{id}`,
  `PUT /api/v1/users/{id}/pin` (self-or-admin).
- Frontend: `rest.ts` staff client methods; the PIN dialog writes through the
  store's `setMemberPin` (document PBKDF2 first, best-effort REST mirror for
  REST-known members; failures logged, never blocking the offline guarantee).
- Still open: Staff & Permissions UI for REST-side member creation and
  activate/deactivate (document actions remain in place until the owners/
  pets-style per-feature cutover reaches staff).

## Blocked by

- Nothing — the routes are independent; the frontend wiring follows.
