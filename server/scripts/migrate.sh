#!/usr/bin/env bash
# Minimal migration runner for server/migrations (golang-migrate-free).
#
# Usage:
#   scripts/migrate.sh                 apply all pending up migrations
#   scripts/migrate.sh status          show applied/pending
#   scripts/migrate.sh fresh           drop + recreate the database, apply all, seed
#
# Environment:
#   DATABASE_URL   libpq connection string (default: see below)
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://vet:vet@localhost:5433/vet_dev?sslmode=disable}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../migrations"
SEED_FILE="$SCRIPT_DIR/seed.sql"

psql_quiet() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

ensure_version_table() {
  psql_quiet -c "
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    );"
}

list_migrations() {
  ls "$MIGRATIONS_DIR" | grep -E '^[0-9]{6}_.*\.up\.sql$' | sed 's/\.up\.sql//' | sort
}

applied_versions() {
  psql "$DATABASE_URL" -tAc "SELECT version FROM schema_migrations;" 2>/dev/null || true
}

apply_all() {
  ensure_version_table
  local applied failed=0
  applied="$(applied_versions)"
  for f in $(list_migrations); do
    local version="${f%%_*}"
    if echo "$applied" | grep -qx "$version"; then
      echo "  = $f (applied)"
      continue
    fi
    echo "  -> applying $f"
    if psql_quiet -f "$MIGRATIONS_DIR/$f.up.sql"; then
      psql_quiet -c "INSERT INTO schema_migrations (version, name) VALUES ($version, '$f');"
    else
      echo "  !! FAILED: $f" >&2
      failed=1
      break
    fi
  done
  return $failed
}

case "${1:-up}" in
  up)
    apply_all
    ;;
  status)
    ensure_version_table
    applied="$(applied_versions)"
    for f in $(list_migrations); do
      version="${f%%_*}"
      if echo "$applied" | grep -qx "$version"; then state="applied"; else state="PENDING "; fi
      echo "  $state $f"
    done
    ;;
  fresh)
    echo "!! This drops and recreates the database. CTRL+C to abort."
    read -r -p "Database: $DATABASE_URL — continue? [y/N] " confirm
    [[ "$confirm" == "y" || "$confirm" == "Y" ]] || exit 1
    DB_NAME="$(psql "$DATABASE_URL" -tAc 'SELECT current_database();')"
    HOST_PART="${DATABASE_URL%%/$DB_NAME*}"
    psql "$HOST_PART/postgres" -c "DROP DATABASE IF EXISTS $DB_NAME;" -c "CREATE DATABASE $DB_NAME;"
    apply_all
    echo "  -> seeding"
    psql_quiet -f "$SEED_FILE"
    ;;
  *)
    echo "usage: $0 [up|status|fresh]" >&2
    exit 2
    ;;
esac
