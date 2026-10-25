# Deploy POC Frontend

Deploy the VetCare clinic frontend POC to Cloudflare Pages (free tier) as a static site.

## Background

- Frontend: `apps/clinic` (Vite + React SPA, react-router)
- The app is browser-safe: all Tauri/IPC calls are guarded by `isTauri()`; in the browser it falls back to `localStorage`
- No backend in cloud deploys — data is per-browser localStorage (fine for POC demos)
- Test files are excluded from typecheck (see `apps/clinic/tsconfig.json`)

## Steps

1. Build (always from repo root):

```bash
pnpm --filter @vet/clinic build
```

2. Ensure the SPA fallback exists so react-router deep links work:
   `apps/clinic/public/_redirects` must contain `/* /index.html 200`
   (recreate it if missing, then rebuild)

3. Deploy:

```bash
npx wrangler pages deploy apps/clinic/dist --project-name vet-poc
```

First run prompts for Cloudflare login (browser OAuth). Reuses `vet-poc` project on subsequent runs.

## Notes

- New `*.pages.dev` subdomains take a few minutes for SSL provisioning — if
  `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`, wait 2-5 minutes before investigating
- Verify with `curl -sI https://<deployment-hash>.vet-poc.pages.dev` (expect `HTTP/2 200`)
- List deployments: `npx wrangler pages deployment list --project-name vet-poc`
