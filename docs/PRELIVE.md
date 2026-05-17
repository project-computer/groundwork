# Prelive Deployment

This guide covers deploying VET Clinic to prelive (staging environment).

## Environment Overview

| Component | Prelive | Production |
|-----------|---------|------------|
| Frontend | Nginx container | CDN or Nginx |
| API | Docker container | Docker container |
| Database | Docker (postgres) | Managed DB |
| File Storage | Local volume | S3 / R2 |
| Access | Cloudflare Tunnel | Cloudflare Tunnel |

## Prerequisites

1. Docker and Docker Compose installed
2. Cloudflare Tunnel token for public access
3. Port 80 available

## 1. Tag Release (Required)

Every deployment requires a new tag. The Discord notification shows all commits since the last tag.

```bash
# Tag with timestamp (recommended for prelive)
git tag -a prelive-$(date +%Y%m%d-%H%M%S) -m "Prelive deploy $(date +%Y-%m-%d %H:%M)"
git push origin --tags

# Or tag with version (for tracked releases)
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

## 2. Configure Environment

Create a `.env` file in the project root:

```env
# Database
DB_USER=vetuser
DB_PASSWORD=vetpass
DB_NAME=vetclinic

# JWT (change for staging!)
JWT_SECRET=your-staging-jwt-secret

# CORS (add your tunnel domain)
CORS_ORIGINS=http://localhost,https://your-tunnel-domain.com

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

## 3. Deploy

### First Deploy or Full Redeploy

Tear down existing services and volumes, then start fresh:

```bash
docker compose -f compose.prelive.yml down -v
docker compose -f compose.prelive.yml up -d --build
```

### Incremental Deploy (no data loss)

If you only need to rebuild services without wiping data:

```bash
docker compose -f compose.prelive.yml up -d --build
```

> **Warning**: `down -v` destroys all data in `postgres_data` and `uploads_data` volumes. Use only when you want a clean slate.

This starts:
- **postgres** - Database with auto-migrations and seed data
- **api** - Go backend (Fiber)
- **frontend** - Nginx serving the built frontend + proxying API
- **cloudflare-tunnel** - Exposes the site through Cloudflare
- **discord-notify-success** - Sends Discord notification with commits since last tag

## 4. Access the Application

Once services are running:

| Service | URL (local) | URL (with tunnel) |
|---------|-------------|-------------------|
| Frontend | `http://localhost` | Your tunnel domain |
| API (proxied) | `http://localhost/api/` | `https://your-domain/api/` |

> **Note**: The API is not exposed on port 8080 in prelive. All API traffic goes through the frontend's nginx proxy at `/api/`.

## 5. Discord Notification (Optional)

Enable Discord notifications for successful deployments.

### Configure Webhook

1. Create a Discord webhook in your server (Server Settings -> Integrations -> Webhooks)
2. Add to `.env`:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url
```

### How It Works

The notification is sent automatically after deployment and includes all commits since the last tag. Make sure you've created a tag before deploying (see Step 1).

Check `docker logs vet-discord-success` if notification doesn't appear.

## 6. Useful Commands

```bash
# View logs
docker compose -f compose.prelive.yml logs -f api
docker compose -f compose.prelive.yml logs -f frontend

# Restart a single service
docker compose -f compose.prelive.yml restart api

# Check service status
docker compose -f compose.prelive.yml ps

# Rebuild only the API
docker compose -f compose.prelive.yml up -d --build api

# Rebuild only the frontend
docker compose -f compose.prelive.yml up -d --build frontend
```

## Architecture Overview

```
                 Internet
                    |
           Cloudflare Tunnel
                   |
             nginx (frontend)
              /          \
     static files     /api/* (proxy)
                        |
                      api
                        |
                    postgres
```

## Data Persistence

All data is stored in Docker volumes:

| Volume | Contents |
|--------|----------|
| `postgres_data` | Database data |
| `uploads_data` | Uploaded files |

### Backup

```bash
# Backup database
docker run --rm -v vet_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data

# Backup uploads
docker run --rm -v vet_uploads_data:/data -v $(pwd):/backup alpine tar czf /backup/uploads-backup.tar.gz /data
```

### Restore

```bash
# Restore database
docker run --rm -v vet_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres-backup.tar.gz -C /

# Restore uploads
docker run --rm -v vet_uploads_data:/data -v $(pwd):/backup alpine tar xzf /backup/uploads-backup.tar.gz -C /
```

## Switching Between Environments

```bash
# Prelive
docker compose -f compose.prelive.yml down -v
docker compose -f compose.prelive.yml up -d --build

# Development
docker compose up -d

# Stop prelive
docker compose -f compose.prelive.yml down
```

## Troubleshooting

### "postgres container unhealthy"

```bash
docker compose -f compose.prelive.yml logs postgres
docker compose -f compose.prelive.yml ps
```

### "API can't connect to database"

Verify the API can reach postgres:

```bash
docker compose -f compose.prelive.yml logs api
```

### "Frontend shows blank page"

Check if the build succeeded and nginx is serving files:

```bash
docker compose -f compose.prelive.yml logs frontend
```

### "Cloudflare tunnel not working"

```bash
docker compose -f compose.prelive.yml logs cloudflare-tunnel
```

Verify your `CLOUDFLARE_TOKEN` in `.env` is correct.

### Seed data missing

The seed runs via postgres init scripts on first container creation. To re-seed:

```bash
docker compose -f compose.prelive.yml down -v
docker compose -f compose.prelive.yml up -d --build
```

> This wipes all data and starts fresh.
