# Agent 09 — Testing Foundation

Read `00-shared-context.md` first. Requires agents 04 and 05.

## Goal

Harden the test infrastructure: shared vitest config, migration tests
against real SQLite, and CI-ready scripts.

## Tasks

1. `apps/clinic` vitest config split: `test.unit` (jsdom, src/**) and
   `test.rust` passthrough invoking `cargo test` — or simply document that
   Rust tests run separately; pick the simpler option and document it.
2. Rust migration tests (extend agent 04's suite in
   `src-tauri/tests/migrations.rs`):
   - Apply all migrations to a fresh temp DB → assert `schema_migrations`
     has all versions and expected tables exist.
   - Apply twice → idempotent, no error.
   - FK test: inserting a pet with unknown `owner_id` fails.
   - Status CHECK test: invalid appointment status insert fails.
3. Domain test audit: confirm agent 05's suites cover invalid transitions,
   monetary rounding edges (e.g. discount > subtotal rejected), and
   negative quantities; add missing cases.
4. Add a root convenience script `pnpm test` that runs domain, validation,
   and desktop suites plus `cargo test`; document exit-code behavior.
5. Playwright: do NOT set up E2E yet (Phase 2+) — but reserve
   `apps/clinic/e2e/README.md` noting the intended Phase-2 workflow test
   (owner → pet → appointment → visit → billing → receipt).

## File boundaries

ONLY: `apps/clinic/vitest.config.ts` (or sibling configs),
`apps/clinic/src-tauri/tests/**`, `packages/domain/**` and
`packages/validation/**` (test files only), root `package.json` (script),
`apps/clinic/e2e/README.md`.

## Verification (run and report output)

```
pnpm test
cargo test --manifest-path apps/clinic/src-tauri/Cargo.toml
pnpm -C apps/clinic lint
```

## Notes

- Never point tests at the real user data dir.
- Do not commit.
