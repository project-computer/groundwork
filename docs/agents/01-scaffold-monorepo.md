# Agent 01 — Scaffold Monorepo + Desktop App

Read `00-shared-context.md` first.

## Goal

Create the root pnpm workspace and a minimal, building React + TypeScript +
Vite app at `apps/clinic` (web only — no Tauri yet; agent 02 adds it).

## Tasks

1. Create root `pnpm-workspace.yaml` including ONLY:
   - `apps/*`
   - `packages/*`
   (Explicitly NOT `frontend` — the legacy app keeps its own workspace.)
2. Create root `package.json` (private) with workspace scripts:
   - `dev`, `build`, `lint`, `test` delegating to `apps/clinic`.
3. Scaffold `apps/clinic` manually (no interactive scaffolders):
   - `package.json` (name `@vet/clinic`), `vite.config.ts`,
     `tsconfig.json` + `tsconfig.node.json`, `index.html`.
   - Dependencies: `react`, `react-dom`.
   - Dev: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`,
     `oxlint`, `@types/react`, `@types/react-dom`.
   - Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`,
     `lint` (`oxlint`), `test` (`vitest run`).
4. `src/main.tsx` rendering a minimal `<App />` ("Vet Clinic" heading is
   enough; agent 06 replaces it).
5. One smoke test (`src/app/app.test.tsx` or similar) asserting the app
   renders, using vitest + `@testing-library/react` (add
   `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`).
6. `.gitignore` additions at root if needed for `apps/clinic` build output
   (`dist`, `node_modules` already covered? verify).

## File boundaries

Create/modify ONLY: `pnpm-workspace.yaml`, root `package.json`,
root `.gitignore` (append-only), everything under `apps/clinic/`.

## Verification (run and report output)

```
pnpm install
pnpm -C apps/clinic build
pnpm -C apps/clinic lint
pnpm -C apps/clinic test
cd frontend && pnpm install --lockfile-only   # prove legacy app unaffected
```

## Notes

- Do NOT add Tailwind, Base UI, Tauri, or router — later agents own those.
- Do not commit.
