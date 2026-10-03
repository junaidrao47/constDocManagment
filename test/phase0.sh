#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/apps/api"
WORKER="$ROOT/apps/worker"
ADMIN="$ROOT/../admin-frontend"
CUSTOMER="$ROOT/../customer-portal"
API_PID=""
WORKER_PID=""

cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$WORKER_PID" ]] && kill "$WORKER_PID" 2>/dev/null || true
  cd "$ROOT"
  docker compose stop postgres redis >/dev/null 2>&1 || true
}
trap cleanup EXIT

step() {
  echo "=== $1 ==="
  shift
  "$@"
}

cd "$ROOT"
step "Start Postgres and Redis" docker compose up -d postgres redis
for attempt in $(seq 1 30); do
  if docker compose ps --format json | grep -q '"Health":"healthy"' && [ "$(docker compose ps --format json | grep -c '"Health":"healthy"')" -ge 2 ]; then break; fi
  if [ "$attempt" -eq 30 ]; then docker compose ps; exit 1; fi
  sleep 2
done

if [[ "${1:-}" == "--reset" ]]; then
  PHASE0_ALLOW_DESTRUCTIVE_RESET=1 npm --prefix "$API" run db:reset
fi
npm --prefix "$API" run db:seed

(cd "$API" && npm run dev > "$ROOT/test/phase0-api.log" 2>&1) & API_PID=$!
(cd "$WORKER" && npm run dev > "$ROOT/test/phase0-worker.log" 2>&1) & WORKER_PID=$!

for attempt in $(seq 1 30); do
  if curl --fail --silent http://localhost:3001/health/ready >/dev/null; then break; fi
  if [ "$attempt" -eq 30 ]; then cat "$ROOT/test/phase0-api.log"; exit 1; fi
  sleep 2
done

step "API typecheck and tests" bash -c "cd '$API' && npm run typecheck && npm run typecheck:test && npm test -- --runInBand && npm run build"
step "Worker typecheck and build" bash -c "cd '$WORKER' && npm run typecheck && npm run build"
step "Admin frontend tests, lint, and build" bash -c "cd '$ADMIN' && npm test && npm run lint && npm run build"
step "Customer frontend tests, lint, and build" bash -c "cd '$CUSTOMER' && npm test && npm run lint && npm run build"

echo "Phase 0 passed."
echo "Admin: http://localhost:3000/admin/login"
echo "Customer: http://localhost:3002"
echo "API: http://localhost:3001/health/ready"
echo "Seed users: admin@test.com, manager@test.com, agent@test.com, customer@test.com"
