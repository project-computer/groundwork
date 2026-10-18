# 0001 — Tauri 2 local-first app

- Status: accepted
- Date: 2026-10-16

## Context

Small clinics (2–5 staff) need a Windows desktop MVP that works offline with
no subscription. A prior full-stack web app (React + Go + PostgreSQL) existed
in this repo but was pre-production and has been removed to avoid maintaining
two products.

## Decision

Build one app in `apps/clinic` on Tauri 2 + React + TypeScript. The same
codebase targets desktop now and Android/iOS later via Tauri mobile. The web
target reuses the same UI with a different persistence adapter (see 0003).

## Consequences

- Local operation never depends on network or subscription.
- One UI codebase for desktop, mobile, and web — platform differences live in
  `src/platform/` and `src/data/` adapters only.
- Tauri mobile init, signing, and store deployment are deferred to Phase 4.
