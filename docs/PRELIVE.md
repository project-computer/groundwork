# Prelive Deployment

This guide covers deploying VET Clinic to prelive (staging environment) on a shared server.

## Architecture

```
Internet
    |
Cloudflare Tunnel ─────────────────────┐
    |                                   |
    ├── vet.example.com → vet-frontend:80 → nginx
    |                                         |
    |                                   /api/* (internal proxy)
    |                                         |
    |                                    vet-api:8080
    |                                         |
    |                                     postgres:5432
    |
    ├── other-app.example.com → other-frontend:80
    └── ...
```

**Key principle**: Zero host ports. The tunnel routes directly to containers via Docker network.

## Prerequisites

1. Docker and Docker Compose installed
2. Cloudflare Tunnel token
3. `proxy` Docker network created

## 1. One-Time Setup

### Create the shared proxy network

```bash
docker network create proxy
```

Created **once per server**. All apps on the server share this network so tunnels can reach containers.

## 2. Configure Environment

Create a `.env` file in the project root:

```env
# Database
DB_USER=vetuser
DB_PASSWORD=vetpass
DB_NAME=vetclinic

# JWT (change for staging!)
JWT_SECRET=your-staging-jwt-secret

# CORS (your tunnel domains)
CORS_ORIGINS=https://vet.yourdomain.com

# Environment
ENV=prelive

# File storage
FILE_STORAGE_TYPE=local
FILE_MAX_SIZE=10485760

# Cloudflare Tunnel
CLOUDFLARE_TOKEN=your-cloudflare-tunnel-token

# Discord (optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url
```

## 3. Tag Release

Every deployment should have a tag. The Discord notification shows all commits since the last tag.

```bash
make prelive-tag
```

Or manually:

```bash
git tag -a prelive-$(date +%Y%m%d-%H%M%S) -m "Prelive deploy $(date +%Y-%m-%d %H:%M)"
git push origin --tags
```

## 4. Deploy

### First deploy / full redeploy (wipes data)

```bash
make prelive-redeploy
```

### Incremental deploy (keeps data)

```bash
make prelive-up
```

### Stop

```bash
make prelive-down
```

> **Warning**: `prelive-redeploy` destroys all data in Docker volumes.

This starts:
- **postgres** — Database with auto-migrations and seed data (internal only)
- **api** — Go backend (internal + proxy network)
- **frontend** — Nginx SPA + `/api/` proxy to backend (internal + proxy network)
- **cloudflare-tunnel** — Routes public traffic to containers (proxy network)
- **discord-notify-success** — Sends deployment notification (runs once)

**No ports are exposed to the host.**

## 5. Configure Cloudflare Tunnel Routes

In Cloudflare Zero Trust → Networks → Tunnels → your tunnel → Public Hostname:

### Frontend (required)

| Field | Value |
|-------|-------|
| Subdomain | `vet` |
| Domain | `yourdomain.com` |
| Type | HTTP |
| URL | `vet-frontend:80` |

The frontend nginx proxies `/api/*` to the backend internally, so one route covers everything.

### API direct access (optional)

| Field | Value |
|-------|-------|
| Subdomain | `vet-api` |
| Domain | `yourdomain.com` |
| Type | HTTP |
| URL | `vet-api:8080` |

## 6. Access

| Service | URL |
|---------|-----|
| Frontend | `https://vet.yourdomain.com` |
| API (proxied) | `https://vet.yourdomain.com/api/` |
| API (direct) | `https://vet-api.yourdomain.com` |

## 7. Discord Notification (Optional)

1. Create a Discord webhook (Server Settings → Integrations → Webhooks)
2. Add to `.env`: `DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...`

The notification includes all commits since the last tag.

## 8. Multi-App Setup

```
Server
├── VET/
│   ├── compose.prelive.yml   # app + its own tunnel
│   └── .env
│
├── EduGuide/
│   ├── compose.prelive.yml   # app + its own tunnel
│   └── .env
│
└── proxy network (shared)
```

Each app:
- Self-contained in its own `compose.prelive.yml` (includes tunnel)
- Connects to shared `proxy` network
- Has unique network aliases (`vet-frontend`, `eduguide-frontend`, etc.)
- Routes configured in Cloudflare dashboard

No port conflicts. No container name collisions.

### Adding a new app

1. Use unique network aliases in the new app's compose (e.g., `myapp-frontend`)
2. Add Cloudflare route: `myapp.yourdomain.com → myapp-frontend:80`
3. Deploy: `docker compose -f compose.prelive.yml up -d --build`

## Useful Commands

```bash
make prelive-logs          # Tail all logs
make prelive-up            # Incremental deploy
make prelive-redeploy      # Full redeploy (wipes data)
make prelive-down          # Stop services
make prelive-tag           # Create + push tag

# Specific service logs
docker compose -f compose.prelive.yml logs -f api
docker compose -f compose.prelive.yml logs -f frontend

# Rebuild only API
docker compose -f compose.prelive.yml up -d --build api
```

## Data Persistence

| Volume | Contents |
|--------|----------|
| `postgres_data` | Database data |
| `uploads_data` | Uploaded files |

### Backup

```bash
docker run --rm -v VET_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data
docker run --rm -v VET_uploads_data:/data -v $(pwd):/backup alpine tar czf /backup/uploads-backup.tar.gz /data
```

### Restore

```bash
docker run --rm -v VET_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres-backup.tar.gz -C /
docker run --rm -v VET_uploads_data:/data -v $(pwd):/backup alpine tar xzf /backup/uploads-backup.tar.gz -C /
```

## Troubleshooting

### "network proxy declared as external, but could not be found"

```bash
docker network create proxy
```

### "Tunnel can't reach container"

```bash
docker network inspect proxy
```

You should see `vet-frontend` and `vet-api` listed.

### "502 Bad Gateway"

```bash
docker compose -f compose.prelive.yml ps
docker compose -f compose.prelive.yml logs frontend
```

### Seed data missing

Seed runs via postgres init scripts on first container creation only:

```bash
make prelive-redeploy
```

### Tunnel logs

```bash
docker compose -f compose.prelive.yml logs cloudflare-tunnel
```
