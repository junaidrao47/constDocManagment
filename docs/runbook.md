# Operations Runbook — Grupo G2H platform

Practical deploy / rollback / incident steps for the production stack
(`compose.prod.yml`: nginx, api, worker, customer, admin, postgres, redis) on the
AWS EC2 box. Commands run from the repo root on the server unless noted. Replace
`<domain>` with the real domain once attached.

> Prerequisites: Docker + Docker Compose on the box; the three repos checked out
> side by side (`constDocManagment/`, `admin-frontend/`, `customer-portal/` — the
> compose build contexts are `../admin-frontend` and `../customer-portal`); a real
> `.env` in `constDocManagment/` (see `.env.example`), `chmod 600 .env`; security
> group open on 80/443 only (SSH from a fixed IP or SSM).

---

## 1. First deploy

```bash
# 1. Build + start the whole stack (api/worker/customer/admin/postgres/redis/nginx).
#    Pass the public API origin so the Next client bundles call the right host.
PUBLIC_API_ORIGIN=https://api.<domain>/api \
ADMIN_API_ORIGIN=https://api.<domain>/api \
docker compose -f compose.prod.yml up --build -d

# 2. Wait for health, then run migrations (the api image owns them).
curl -fsS http://localhost/health/ready          # {"status":"ready",...}
docker compose -f compose.prod.yml exec api npm run db:migrate

# 3. Seed only client-approved data (NOT the demo set) for a real launch.
#    Demo walkthrough instead? use db:seed:demo, then db:purge:demo before go-live.
docker compose -f compose.prod.yml exec api npm run db:seed        # base catalogue/users

# 4. Post-deploy smoke against the running stack (authoritative gate).
docker compose -f compose.prod.yml exec -e SMOKE_API_URL=http://localhost/api \
  api npx ts-node src/scripts/smoke.ts            # expect "N passed, 0 failed"
```

Over plain HTTP the box serves the **API + public site** on its IP immediately.
The **admin portal** and HTTPS need the per-host TLS blocks (section 3).

## 2. Routine redeploy (new code)

```bash
git pull                                          # in each of the 3 repos as needed
docker compose -f compose.prod.yml up --build -d  # rebuilds only changed images
docker compose -f compose.prod.yml exec api npm run db:migrate   # if migrations added
# re-run the post-deploy smoke (section 1.4)
```

## 3. Enable HTTPS (once DNS + domain exist)

1. Point DNS A records at the box's Elastic IP: apex, `www`, `admin.`, `api.`.
2. Issue certs (certbot writes into the mounted `ssl_certs` volume → `/etc/letsencrypt`):
   ```bash
   docker run --rm -v constdocmanagment-prod_ssl_certs:/etc/letsencrypt \
     -p 80:80 certbot/certbot certonly --standalone \
     -d <domain> -d www.<domain> -d admin.<domain> -d api.<domain>
   ```
   (Stop nginx first, or use the webroot plugin.)
3. In `nginx/nginx.conf`: fill `<domain>` into the three commented 443 server blocks,
   uncomment them, and change the `:80` server to `return 301 https://$host$request_uri;`.
4. `docker compose -f compose.prod.yml up --build -d nginx` and verify:
   `curl -fsSI https://<domain>` and `https://admin.<domain>` and `https://api.<domain>/health`.
5. Set up cert auto-renew (certbot renew via cron/systemd timer, then reload nginx).

## 4. Rollback

Images are built on the box, so roll back by rebuilding the previous commit:

```bash
git -C constDocManagment log --oneline -5         # find the last-good commit
git -C constDocManagment checkout <good-sha>      # and the same for the frontends if needed
docker compose -f compose.prod.yml up --build -d
```

- **A migration broke things:** migrations are forward-only here. Restore the DB from
  the latest dump (section 5) BEFORE checking out old code, then redeploy the old code.
  Never point old code at a newer schema without testing.
- **Fast mitigation:** `docker compose -f compose.prod.yml restart <service>` clears a
  wedged container without a rebuild.

## 5. Backup & restore (Postgres)

- **⚠️ Automated backup is NOT implemented yet.** `apps/worker/src/crons/backup.cron.ts`
  is a stub (`// TODO: not implemented`). Until it is built, back up with the manual dump
  below driven by an **external cron / systemd timer on the box** (and verify objects land
  in `S3_BACKUP_BUCKET`). A tested restore is a launch blocker — rehearse it.
- **Manual dump:**
  ```bash
  docker compose -f compose.prod.yml exec postgres \
    pg_dump -U "$DB_USER" "$DB_NAME" | gzip > backup-$(date +%F).sql.gz
  ```
- **Restore (rehearse this before launch — untested restore = no backup):**
  ```bash
  gunzip -c backup-YYYY-MM-DD.sql.gz | \
    docker compose -f compose.prod.yml exec -T postgres psql -U "$DB_USER" -d "$DB_NAME"
  ```

## 6. Common incidents

| Symptom | Check | Action |
|---|---|---|
| 502 from nginx | `docker compose -f compose.prod.yml ps` | restart the unhealthy upstream (api/customer/admin) |
| `/health/ready` not ready | `...logs api`; DB/Redis up? | restart postgres/redis; check `.env` DATABASE_URL/REDIS_URL |
| Emails not sending | `...logs worker`; SES sandbox? suppressions? | confirm SES production access; check the suppression list |
| Uploads rejected (413) | nginx `client_max_body_size` (26m) vs multer (25m) | keep them in sync; see `nginx.conf` |
| Disk full | `docker system df` | `docker image prune`; check postgres volume growth |

## 7. Pre-launch checklist pointer

The go/no-go gate and the full launch-day checklist live in
`docs/production-readiness-<date>.md`. The authoritative functional gate is always
`npm run smoke` returning `0 failed` against the running stack.
