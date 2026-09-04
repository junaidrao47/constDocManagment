# AGENT.md

This repository is a Docker-based backend project for a document and compliance platform. The workflow below is required for all future code changes.

## Core rules

1. Keep the architecture layered.
   - Routes handle HTTP concerns only.
   - Services contain business logic.
   - Entities define database contracts.
   - Repositories are accessed through TypeORM data sources.
   - Utility files are kept for shared helpers, storage, token logic, and HTTP error handling.

2. Never put business logic directly inside route files.
   - Route files should validate request shape and delegate to services.
   - Service files should own validation flow and database operations.

3. Keep database work in dedicated data-layer code.
   - Use TypeORM entities and repositories.
   - Do not write raw SQL in route or service logic unless absolutely necessary.
   - Use migrations for schema changes.

4. Use environment-based configuration.
   - All secrets and runtime config must come from environment variables.
   - Do not hardcode secret keys, URLs, or service names.

5. Keep Docker simple and production-friendly.
   - Prefer stable container boundaries: `api`, `worker`, `postgres`, `redis`, `nginx`.
   - Do not mix production and local-only behavior in the same service unless necessary.

6. Security first.
   - Always validate input with zod schemas.
   - Use JWT with secure secrets.
   - Enforce role checks on protected routes.
   - Do not expose sensitive metadata in API responses.

7. Document every technical decision.
   - Add a concise entry in `docs/decision-log.md` whenever a meaningful architecture, setup, security, database, or deployment choice is made.
   - Keep it append-only and minimal.

## Project conventions

- API entry point: `apps/api/src/server.ts`
- Worker entry point: `apps/worker/src/worker.ts`
- App bootstrap: `apps/api/src/app.ts`
- Database init: `apps/api/src/config/database.ts`
- Redis init: `apps/api/src/config/redis.ts`
- Environment validation: `apps/api/src/config/env.ts`
- Migrations: `apps/api/src/migrations/`

## Required workflow for new work

1. Understand the request.
2. Verify existing architecture before editing.
3. Add/update a decision log entry if the change affects architecture, setup, or security.
4. Keep changes modular and documented.
5. Validate the smallest relevant command.

## Production checklist

- use `compose.prod.yml`
- keep secrets in `.env` or a secure secret manager
- use strict CORS and HTTPS
- use Postgres volumes for persistence
- use Redis for queues and token/session cache
- keep worker separated from API
- use migrations, not ad-hoc schema changes

## Decision log rule

This file is not a full design document. It is a compact history of important choices. Each new decision should be added as a new dated entry in `docs/decision-log.md`.
