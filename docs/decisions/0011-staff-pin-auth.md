# 0011 — Staff PIN authentication for the local-first desktop app

- Status: accepted
- Date: 2026-10-28

## Context

The desktop app is the clinic's system of record and runs offline. Until now it
opened unlocked and "Sign in as" was a free account switcher — fine for a demo,
wrong for a shared front-desk terminal where anyone walking past could act as an
admin. MVP-02 requires authentication, and `CONTEXT.md` already defines a User as
an *authenticated* clinic staff account.

The backend keeps its own JWT login for cloud sync, but it is optional: a clinic
that never configures `VET_CLOUD_URL` must still be able to authenticate staff
locally, with no network and no server dependency.

## Decision

Authenticate staff **locally with a PIN**, stored as a salted PBKDF2-SHA-256 hash
in the clinic document.

- 4–8 digits, validated at the UI and hashed with WebCrypto PBKDF2 (SHA-256,
  120,000 iterations, 16-byte random salt per member). Plain PINs are never
  persisted, exported, or synced.
- The clinic document starts **locked** when the signed-in member holds a PIN;
  the lock screen lists active staff and verifies the typed PIN in constant time.
- A member can set or change their own PIN; admins can set, reset, or clear
  anyone's (both paths write a `staff.pin_set` / `staff.pin_clear` audit entry).
- Switching accounts with `Sign in as` locks the app on the target member, so the
  PIN is always verified on the lock screen before the session changes.
- Clinics that have not set any PINs keep the switcher until an admin adds one —
  this avoids locking existing installs out on upgrade and is surfaced as a hint
  on the lock screen and in Staff & Permissions.
- The topbar exposes an explicit lock action for stepping away from the terminal.

The PIN is a convenience credential for a trusted device, not a replacement for
OS-level disk encryption: an attacker with the unencrypted database file can
brute-force a short PIN offline. The threat model is a shared workstation, and
the hash parameters make scripted guessing expensive.

## Consequences

- No new dependency, no server round-trip, works fully offline.
- Anyone with write access to the clinic document can reset a PIN by editing the
  file; tamper evidence remains the audit log and backups, as before.
- If the product later needs stronger credentials (per-member passwords, SSO),
  the session gate and `signIn` action stay; only `lib/vet/auth.ts` changes.
