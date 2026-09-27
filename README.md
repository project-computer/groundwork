# VetCare Clinic Management System

Full-stack veterinary clinic management system with a React frontend and Go API backend.

## Project Structure

```
.
├── frontend/          # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/   # Primer React components
│   │   ├── hooks/        # React Query hooks
│   │   ├── lib/          # API client, auth context
│   │   └── pages/        # Route pages
│   └── ...
├── backend/           # Go + Fiber v3 + PostgreSQL
│   ├── cmd/api/          # Entry point
│   ├── internal/
│   │   ├── handlers/     # HTTP handlers
│   │   ├── service/      # Business logic
│   │   ├── repository/   # Database queries
│   │   ├── models/       # Data models
│   │   ├── middleware/    # Auth, CORS, logging
│   │   └── utils/        # Helpers
│   ├── migrations/       # SQL schema
│   └── scripts/          # Seed data
├── docker-compose.yml # Full-stack deployment
└── Makefile           # Dev commands
```

## Quick Start

### Prerequisites

- **Node.js** 20+ and **pnpm**
- **Go** 1.27+
- **Docker** (for PostgreSQL, or use your own)

### 1. Start the database

```bash
make db
```

This starts PostgreSQL in Docker with the right credentials.

### 2. Run migrations and seed data

```bash
make db-seed
```

Creates tables and inserts sample data (5 pets, 3 appointments, 1 visit, 1 bill, 1 prescription).

### 3. Set up environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Defaults work out of the box for local development.

### 4. Install frontend dependencies

```bash
cd frontend && pnpm install
```

### 5. Start both servers

```bash
# Terminal 1 — Backend (port 8080)
make dev-backend

# Terminal 2 — Frontend (port 5173)
make dev-frontend
```

Or run both at once:

```bash
make dev
```

### 6. Open the app

Go to [http://localhost:5173](http://localhost:5173) and log in with:

| Email | Password | Role |
|-------|----------|------|
| `admin@happypaws.vet` | `admin123` | Admin |
| `mchen@happypaws.vet` | `admin123` | Veterinarian |
| `emily@happypaws.vet` | `admin123` | Receptionist |

## Docker Deployment

Build and run the entire stack:

```bash
make docker-up
```

This starts PostgreSQL, the Go API, and an Nginx-served frontend. The app is available at [http://localhost:5173](http://localhost:5173).

```bash
make docker-down   # Stop everything
```

## Features

- **Dashboard** — Stats, revenue chart, today's appointments
- **Patients** — CRUD with search, species/status filters
- **Appointments** — Schedule, check-in (creates visit), cancel
- **Visits** — Full clinical workflow (OPD/IPD): vitals, exam, diagnosis, treatment, medications
- **Queue** — Kanban board: Waiting → In Examination → Done
- **Billing** — Create invoices from visits, mark paid, print
- **Prescriptions** — Generate from visits, print Rx
- **Medical Records** — OPD/IPD history view

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Primer React, styled-components, React Router v7, React Query, Recharts |
| Backend | Go, Fiber v3, pgx v5, JWT auth, bcrypt |
| Database | PostgreSQL 15 |
| Deployment | Docker Compose, Nginx |

## Available Commands

```bash
make help          # Show all commands
make dev           # Start frontend + backend
make db            # Start PostgreSQL
make db-seed       # Run migrations + seed
make db-reset      # Drop, recreate, reseed
make build         # Build both frontend and backend
make docker-up     # Deploy with Docker Compose
make docker-down   # Tear down Docker
```
