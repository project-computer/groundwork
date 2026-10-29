# Backend dev scripts

## One-time setup

```sh
docker compose up -d                       # repo root: Postgres 18 on :5433 (vet/vet, db vet_dev)
export DATABASE_URL="postgres://vet:vet@localhost:5433/vet_dev?sslmode=disable"
scripts/migrate.sh fresh                   # migrations + seed (two clinics, password "admin123" everywhere)
```

## Day to day

```sh
scripts/migrate.sh            # apply pending migrations (tracked in schema_migrations)
scripts/migrate.sh status     # applied/pending overview
scripts/migrate.sh fresh      # drop, recreate, migrate, re-seed

cd backend && \
DATABASE_URL="$DATABASE_URL" JWT_SECRET=devsecret go run ./cmd/api

scripts/smoke.sh http://localhost:8080/api/v1   # 19 end-to-end assertions
```

## What the seed contains

- Clinic 1 "Baan Sathorn Animal Clinic" (4 users, 5 patients, a closed visit with
  prescription + bill + partial payment, vaccinations, full pharmacy with lots)
- Clinic 2 "Riverside Veterinary Referral" (2 users) — exists so the cross-clinic
  case-transfer flow can be exercised locally
- The smoke script asserts: history aggregation, partial→paid settlement, overpay
  rejection, void rules, settings merge, token-link preview → accept → re-accept
  block, image upload/serve, and that this run's audit entries exist.
