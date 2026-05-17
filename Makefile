.PHONY: help dev dev-backend dev-frontend db db-seed db-reset docker-up docker-down prelive-up prelive-down prelive-redeploy prelive-logs prelive-tag build

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Development ──────────────────────────────────────────

dev: ## Start both frontend and backend (requires DB running)
	@echo "Starting backend..."
	@cd backend && air &
	@echo "Starting frontend..."
	@cd frontend && pnpm dev
	@wait

dev-backend: ## Start backend only
	cd backend && go run cmd/api/main.go

dev-frontend: ## Start frontend only
	cd frontend && pnpm dev

# ── Database ─────────────────────────────────────────────

db: ## Start PostgreSQL via Docker
	docker compose up postgres -d

db-seed: ## Run schema + seed against local DB
	@echo "Running migrations..."
	PGPASSWORD=vetpass psql -h localhost -U vetuser -d vetclinic -f backend/migrations/000001_init_schema.up.sql
	@echo "Seeding data..."
	PGPASSWORD=vetpass psql -h localhost -U vetuser -d vetclinic -f backend/scripts/seed.sql

db-reset: ## Drop and recreate database
	PGPASSWORD=vetpass psql -h localhost -U vetuser -d postgres -c "DROP DATABASE IF EXISTS vetclinic;"
	PGPASSWORD=vetpass psql -h localhost -U vetuser -d postgres -c "CREATE DATABASE vetclinic;"
	@$(MAKE) db-seed

# ── Docker (development) ────────────────────────────────

docker-up: ## Start all services via Docker Compose
	docker compose up --build -d

docker-down: ## Stop all services
	docker compose down

# ── Prelive ──────────────────────────────────────────────

prelive-tag: ## Create prelive deployment tag
	git tag -a prelive-$$(date +%Y%m%d-%H%M%S) -m "Prelive deploy $$(date +%Y-%m-%d\ %H:%M)"
	git push origin --tags

prelive-up: ## Start prelive services (incremental, keeps data)
	docker compose -f compose.prelive.yml up -d --build

prelive-down: ## Stop prelive services
	docker compose -f compose.prelive.yml down

prelive-redeploy: ## Full prelive redeploy (wipes all data!)
	docker compose -f compose.prelive.yml down -v
	docker compose -f compose.prelive.yml up -d --build

prelive-logs: ## Tail prelive logs
	docker compose -f compose.prelive.yml logs -f

# ── Build ────────────────────────────────────────────────

build-backend: ## Build Go binary
	cd backend && go build -o bin/api ./cmd/api

build-frontend: ## Build frontend for production
	cd frontend && pnpm build

build: build-backend build-frontend ## Build everything
