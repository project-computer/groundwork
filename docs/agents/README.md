# Agent Delegation Index — Vet Clinic Desktop MVP

One agent = one brief. Each brief is self-contained; every agent MUST read
`00-shared-context.md` before touching any file.

## Rules for all agents

1. Read `00-shared-context.md` first.
2. Work ONLY inside the file boundaries listed in your brief.
3. Do not modify `frontend/`, `server/`, `compose.yml`, or the root `Makefile`.
4. Do not commit unless your brief says so. Never commit secrets.
5. Run the verification commands listed in your brief and report actual output.
6. Do not claim tests/builds passed unless you ran them.
7. If a decision blocks you, implement the documented default and note it in
   your report — do not build speculative alternatives.
8. Report: files changed, commands run, results, limitations, next steps.

## Briefs and dependency graph

| Brief | Agent task | Depends on |
|---|---|---|
| `01-scaffold-monorepo.md` | Root pnpm workspace + `apps/clinic` Vite/React/TS app | — |
| `02-tauri-setup.md` | Tauri 2 runtime, window config, dev/build on Linux | 01 |
| `03-design-system.md` | Tailwind + design tokens + Base UI base components | 01 |
| `04-database-rust.md` | SQLite (Rust), migrations, Tauri commands | 02 |
| `05-domain-layer.md` | Domain types, Zod validation, repository interfaces | 01 |
| `06-app-shell.md` | Sidebar navigation, routing, placeholder screens | 03 |
| `07-data-bridge.md` | TypeScript repository adapter over Tauri commands | 04, 05 |
| `08-adr-and-docs.md` | ADRs, architecture.md, data-model.md, README updates | 01 |
| `09-testing-foundation.md` | Vitest infra + domain/migration tests | 05, 04 |

Parallel tracks after 01 completes:

```
01 scaffold ──┬── 02 tauri ──── 04 database ──┐
              ├── 03 design ──── 06 shell     ├── 07 bridge ── (Phase 1 done)
              ├── 05 domain ──────────────────┤
              └── 08 docs                     └── 09 testing
```

## Definition of done — Phase 1

- `pnpm -C apps/clinic tauri dev` launches the desktop shell.
- SQLite initializes on first launch; migrations apply and are versioned.
- Design tokens + Base UI integration exist with a sample component.
- Repository interfaces defined; domain types have unit tests.
- `pnpm build`, `pnpm lint`, `pnpm test` pass in `apps/clinic`.
- ADRs committed under `docs/decisions/`.
