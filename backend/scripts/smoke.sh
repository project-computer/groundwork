#!/usr/bin/env bash
# End-to-end API smoke test against a running server.
#
# Prerequisites:
#   1. docker compose up -d                      (repo root)
#   2. backend/scripts/migrate.sh fresh          (applies migrations + seed)
#   3. start the API:
#        cd backend && DATABASE_URL=... JWT_SECRET=devsecret go run ./cmd/api
#
# Usage: scripts/smoke.sh [BASE_URL]
#   BASE_URL defaults to http://localhost:8080/api/v1
#
# Exits non-zero on the first failed assertion. Safe to run repeatedly (it
# creates its own fixture rows; it does not mutate the seed beyond payments
# on a new bill).
set -euo pipefail

BASE="${1:-http://localhost:8080/api/v1}"
PASS=0
FAIL=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say()  { printf '\n== %s\n' "$*"; }
json() { python3 -c "import sys, json; d = json.load(sys.stdin); print(d$1)"; }

expect() { # expect <description> <actual> <expected>
  if [[ "$2" == "$3" ]]; then
    PASS=$((PASS + 1)); echo "  ok: $1"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL: $1 (got '$2', want '$3')" >&2
  fi
}

login() { # login <email> -> writes token to $TMP/t-<email>
  curl -sS -m 10 -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\": \"$1\", \"password\": \"admin123\"}" | json "['accessToken']" > "$TMP/t-$1"
}

token() { cat "$TMP/t-$1"; }

api() { # api <method> <token-file> <path> [body]
  local method="$1" tok="$2" path="$3" body="${4:-}"
  local args=(-sS -m 10 -X "$method" "$BASE$path" -H "Authorization: Bearer $(cat "$TMP/$tok")")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' -d "$body")
  curl "${args[@]}"
}

say "health"
expect "server responds" "$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "${BASE%/api/v1}/health")" "200"

say "login (clinic 1 admin + clinic 2 admin)"
login admin@baansathorn.vet
login admin@riverside.vet
expect "clinic-1 token issued" "$([[ -s "$TMP/t-admin@baansathorn.vet" ]] && echo yes)" "yes"
expect "clinic-2 token issued" "$([[ -s "$TMP/t-admin@riverside.vet" ]] && echo yes)" "yes"

# Audit entries created by THIS run are counted relative to the current max id.
AUDIT_DB="${DATABASE_URL:-postgres://vet:vet@localhost:5433/vet_dev?sslmode=disable}"
AUDIT_BASE=$(psql "$AUDIT_DB" -tAc "SELECT coalesce(max(id), 0) FROM audit_logs;" | tr -d ' ')

say "patient medical history (GET /patients/3/history)"
HIST=$(api GET t-admin@baansathorn.vet /patients/3/history)
hist_len() { echo "$HIST" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['$1']))"; }
expect "history has the seeded visit"        "$(hist_len visits | awk '{print ($1>=1)?1:0}')" "1"
expect "history has bills"                   "$(hist_len bills | awk '{print ($1>=1)?1:0}')" "1"
expect "history has the seeded vaccination"  "$(hist_len vaccinations)" "1"

say "billing: partial payment then settlement"
BILL=$(api POST t-admin@baansathorn.vet /bills '{"petId": 3, "petName": "Tiger", "ownerName": "Somchai Prasert", "date": "'"$(date +%F)"'", "items": [{"description": "Recheck", "quantity": 1, "price": 300}]}')
BID=$(echo "$BILL" | json "['id']")
P1=$(api POST t-admin@baansathorn.vet "/bills/$BID/payments" '{"amount": 100, "method": "cash"}')
expect "partial payment status"    "$(echo "$P1" | json "['summary']['status']")" "Partial"
OVER=$(api POST t-admin@baansathorn.vet "/bills/$BID/payments" '{"amount": 999, "method": "cash"}')
expect "overpayment rejected"      "$(echo "$OVER" | json "['error']" 2>/dev/null || echo none)" "payment_failed"
P2=$(api POST t-admin@baansathorn.vet "/bills/$BID/payments" '{"amount": 230, "method": "transfer"}')
expect "settled to Paid"           "$(echo "$P2" | json "['summary']['status']")" "Paid"
VOID=$(api POST t-admin@baansathorn.vet "/bills/$BID/void" '{}')
expect "void blocked with payments" "$(echo "$VOID" | json "['error']" 2>/dev/null || echo none)" "void_failed"

say "settings: merge roundtrip"
api PUT t-admin@baansathorn.vet /settings '{"settings": {"opening_hours": "09:00-20:00"}}' > /dev/null
S=$(api GET t-admin@baansathorn.vet /settings)
expect "settings persisted" "$(echo "$S" | json "['settings']['opening_hours']")" "09:00-20:00"

say "case transfer: clinic 1 -> clinic 2"
CT=$(api POST t-admin@baansathorn.vet /case-transfers '{"patientId": 3, "visitIds": [1], "note": "smoke"}')
TK=$(echo "$CT" | json "['token']")
PREVIEW=$(curl -sS -m 10 "$BASE/case-transfers/preview/$TK")
expect "public preview shows patient" "$(echo "$PREVIEW" | json "['patient']['name']")" "Tiger"
ACCEPT=$(api POST t-admin@riverside.vet "/case-transfers/accept/$TK")
expect "accept reports copied visit"  "$(echo "$ACCEPT" | json "['visitsCopied']")" "1"
AGAIN=$(api POST t-admin@riverside.vet "/case-transfers/accept/$TK")
expect "re-accept blocked"            "$(echo "$AGAIN" | json "['error']" 2>/dev/null || echo none)" "not_pending"

say "visit images: upload, list, serve"
printf '\x89PNG\r\n\x1a\n smoke-test-bytes' > "$TMP/px.png"
IMG=$(curl -sS -m 10 -X POST "$BASE/visits/1/images" -H "Authorization: Bearer $(token admin@baansathorn.vet)" -F "file=@$TMP/px.png" -F "caption=smoke")
KEY=$(echo "$IMG" | json "['fileKey']")
expect "upload returns key" "$([[ -n "$KEY" && "$KEY" != "None" ]] && echo yes)" "yes"
SERVE=$(curl -sS -m 10 -o "$TMP/served.bin" -w '%{http_code}' "$BASE/files/$KEY")
expect "served 200" "$SERVE" "200"
cmp -s "$TMP/served.bin" "$TMP/px.png" && expect "served bytes identical" yes yes || expect "served bytes identical" no yes
BADKEY=$(python3 -c "print('0'*64 + '.png')")
expect "unknown key 404" "$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$BASE/files/$BADKEY")" "404"

say "audit trail"
AUDIT=$(psql "$AUDIT_DB" -tAc \
  "SELECT count(DISTINCT action) FROM audit_logs WHERE id > $AUDIT_BASE AND action IN ('bill.payment_recorded', 'case_transfer.created', 'case_transfer.accepted');")
expect "audit entries recorded this run" "$(echo "$AUDIT" | tr -d ' ')" "3"

printf '\n== smoke: %d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
