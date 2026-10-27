# Deploy Runbook — Grupo G2H (AWS EC2, Docker)

Operational guide for the production deployment. Last updated 2026-10-27.

> Secrets are **never** in this file or in git. They live only in `/opt/g2h/.env` on the
> server (chmod 600) and are injected by the IAM instance role for AWS.

---

## 1. What runs where

- **EC2** `i-0d8123861d01de683` (`g2h-prod`, t3.medium, us-east-1c), Elastic IP **52.73.242.143**.
- **Instance role** `g2h-ec2-role` provides AWS creds (S3, SES, ECR pull) — **no keys on the box**.
- **Stack** (`/opt/g2h/compose.prod.yml`, project `constdocmanagment-prod`): `nginx` (only service
  publishing ports — 80/443), `api`, `worker`, `customer`, `admin`, `postgres`, `redis`.
- App code ships as **prebuilt images** pulled from ECR
  `666715258458.dkr.ecr.us-east-1.amazonaws.com/g2h/{api,worker,portal,admin}`; nginx is built on the box.
- **Hostnames** (all → the Elastic IP, DNS at GoDaddy):
  - `grupog2h.com`, `www.` → public site + customer portal
  - `admin.grupog2h.com` → admin/staff portal
  - `api.grupog2h.com` → backend API
- **S3**: `g2h-prod-documents` (private docs), `cosntdoc-images` (public images), `g2h-prod-backups` (dumps).

## 2. Build & push images (from a dev laptop)

Requires the `g2h` AWS profile with the `g2h-ecr-push` policy, and Docker with buildx.

```bash
REG=666715258458.dkr.ecr.us-east-1.amazonaws.com
aws ecr get-login-password --profile g2h --region us-east-1 | docker login --username AWS --password-stdin $REG
API=https://api.grupog2h.com/api   # baked into the CLIENT bundles at build time

docker build --platform linux/amd64 --target production -t $REG/g2h/api:$(git -C constDocManagment rev-parse --short HEAD)    -t $REG/g2h/api:latest    constDocManagment/apps/api
docker build --platform linux/amd64 --target production -t $REG/g2h/worker:$(git -C constDocManagment rev-parse --short HEAD) -t $REG/g2h/worker:latest constDocManagment/apps/worker
docker build --platform linux/amd64 --build-arg NEXT_PUBLIC_API_URL=$API -t $REG/g2h/portal:latest customer-portal
docker build --platform linux/amd64 --build-arg NEXT_PUBLIC_API_URL=$API -t $REG/g2h/admin:latest  admin-frontend

for r in api worker portal admin; do docker push --all-tags $REG/g2h/$r; done
```

> The frontends bake `NEXT_PUBLIC_API_URL` at build time — changing the public API origin means rebuilding `portal` and `admin`.

## 3. Update a running deployment

On the box, each repo rolls its own `:latest`, so a normal update is:

```bash
ssh -i <key> ubuntu@52.73.242.143
cd /opt/g2h
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 666715258458.dkr.ecr.us-east-1.amazonaws.com
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d          # recreates only changed services
# if any DB migrations shipped, the api applies them on boot; verify:
docker compose -f compose.prod.yml exec -T api node node_modules/typeorm/cli.js migration:show -d dist/config/database.js
```

## 4. First-time / from-scratch deploy

1. `mkdir -p /opt/g2h`; copy `compose.prod.yml`, `nginx/`, `docker/` into it.
2. Create `/opt/g2h/.env` (chmod 600) from `.env.example`. Generate secrets on the box; **never print or commit them**:
   - `JWT_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars, must differ), `DB_PASS`, `REDIS_PASSWORD` via `openssl rand -hex 32`/`24`.
   - Non-secret: `ECR_REGISTRY=…/g2h`, `IMAGE_TAG=latest`, `AWS_REGION=us-east-1`,
     `S3_BUCKET=g2h-prod-documents`, `S3_PUBLIC_BUCKET=cosntdoc-images`, `S3_BACKUP_BUCKET=g2h-prod-backups`,
     `CORS_ORIGIN=https://grupog2h.com,https://www.grupog2h.com,https://admin.grupog2h.com`,
     `WEB_URL=https://grupog2h.com`, `API_URL=https://api.grupog2h.com`, `MAIL_FROM=no-reply@grupog2h.com`,
     `DB_USER=g2h`, `DB_NAME=construction_db`.
   - **No AWS keys** — the instance role provides them.
3. **TLS bootstrap (only needed when no cert exists yet).** The committed `nginx.conf` references
   `/etc/letsencrypt/live/grupog2h.com/…`, so nginx will not start before the cert exists. For a brand-new
   box, first run nginx with an HTTP-only config that serves `/.well-known/acme-challenge/` (see
   `scratchpad nginx.bootstrap.conf` pattern: a single `:80` server proxying `/` to `customer` plus the ACME
   location), then issue the cert (step 6), then put the real `nginx.conf` back and reload. On this box the
   cert already lives in the persistent `ssl_certs` volume, so restarts need no bootstrap.
4. Login + pull + up:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 666715258458.dkr.ecr.us-east-1.amazonaws.com
   docker compose -f compose.prod.yml pull
   docker compose -f compose.prod.yml up -d
   ```
5. Migrations apply on api boot; confirm `GET http://localhost/health/ready` → `database:true, redis:true`.
6. Issue certs (webroot, zero downtime):
   ```bash
   docker compose -f compose.prod.yml --profile certbot run --rm certbot certonly --webroot -w /var/www/certbot \
     -d grupog2h.com -d www.grupog2h.com -d api.grupog2h.com -d admin.grupog2h.com \
     --email admin@grupog2h.com --agree-tos --no-eff-email --non-interactive
   docker compose -f compose.prod.yml exec -T nginx nginx -t && docker compose -f compose.prod.yml exec -T nginx nginx -s reload
   ```
7. Create the first admin (password typed at the prompt, never stored):
   ```bash
   read -s -p "admin password (8-72): " PW; echo
   docker compose -f compose.prod.yml exec -e BOOTSTRAP_ADMIN_EMAIL=admin@grupog2h.com -e BOOTSTRAP_ADMIN_PASSWORD="$PW" \
     -e BOOTSTRAP_ADMIN_NAME='Platform Administrator' api node dist/scripts/create-admin.js
   unset PW
   ```

## 5. TLS renewal

Auto-renew cron runs `02:00`-ish via certbot `renew` + `nginx -s reload` (twice daily, `03:00 & 15:00`).
Verify: `docker compose -f compose.prod.yml --profile certbot run --rm certbot renew --dry-run`.

## 6. Backups & restore

- Nightly `pg_dump` → `s3://g2h-prod-backups/postgres/` via `/opt/g2h/backup.sh` (cron `30 2 * * *`, log `/var/log/g2h-backup.log`).
- Retention: a 30-day S3 lifecycle rule on prefix `postgres/`.
- **Restore** (into a running stack):
  ```bash
  aws s3 cp s3://g2h-prod-backups/postgres/<file>.sql.gz /tmp/restore.sql.gz --region us-east-1
  gunzip -c /tmp/restore.sql.gz | docker compose -f compose.prod.yml exec -T postgres \
    sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -h 127.0.0.1'
  ```

## 7. Operations

```bash
docker compose -f compose.prod.yml ps                    # status/health
docker compose -f compose.prod.yml logs -f api           # follow a service
docker compose -f compose.prod.yml restart api           # restart one service
curl -s https://api.grupog2h.com/health/ready            # deps (db+redis)
```
nginx config is bind-mounted (`./nginx/nginx.conf`), so a config change is `scp` + `nginx -s reload` — no image rebuild.

## 8. Known open items

- **IAM**: role policy `g2h-app-access` still references non-existent `g2h-prod-public`; repoint to
  `cosntdoc-images` (public image/hero uploads will 403 until then).
- **CI/CD** (not built): GitHub OIDC → `g2h-github-actions` role for ECR push; deploy via SSM
  (needs `AmazonSSMManagedInstanceCore` on `g2h-ec2-role`); enable only after a clean manual deploy.
- **SES**: production access / SNS bounce handling pending — don't rely on mail to arbitrary addresses yet.
