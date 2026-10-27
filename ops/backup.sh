#!/usr/bin/env bash
# Nightly Postgres backup for Grupo G2H -> s3://g2h-prod-backups/postgres/
# Runs on the EC2 host (deployed to /opt/g2h/backup.sh). Uses the instance IAM
# role for S3 (no keys). Installed as a cron job (02:30 UTC); see docs/deploy-runbook.md.
set -euo pipefail

cd /opt/g2h

TS=$(date -u +%Y%m%dT%H%M%SZ)
FILE="/tmp/g2h-${TS}.sql.gz"
BUCKET="s3://g2h-prod-backups/postgres/g2h-${TS}.sql.gz"

# Dump from inside the postgres container (password + user/db come from its env).
docker compose -f compose.prod.yml exec -T postgres \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -h 127.0.0.1' \
  | gzip > "$FILE"

SIZE=$(wc -c < "$FILE")
if [ "$SIZE" -lt 1000 ]; then
  echo "$(date -u +%FT%TZ) ERROR: dump too small (${SIZE}B), aborting upload" >&2
  rm -f "$FILE"
  exit 1
fi

aws s3 cp "$FILE" "$BUCKET" --region us-east-1
rm -f "$FILE"
echo "$(date -u +%FT%TZ) OK: uploaded ${BUCKET} (${SIZE}B gzipped)"
