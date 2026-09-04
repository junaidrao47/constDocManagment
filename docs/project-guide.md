# Project Guide

This project is a backend system for a construction and document-management platform. It is designed around a layered architecture where each part has a clear responsibility.

## Who this project is for

- customers who upload documents and manage subscriptions
- agents or admins who review and approve documents
- managers who oversee operations
- admins who configure pricing and system settings

## High-level flow

1. Client sends HTTP request.
2. Nginx receives the request and forwards it to the API service.
3. API validates input and authenticates/authorizes the user.
4. Service layer executes business logic.
5. Database operations use TypeORM and Postgres.
6. Background tasks go to Redis and are processed by the worker.
7. The result is returned to the client in a standard JSON envelope.

## Main architectural layers

### 1. Routes
Files under `apps/api/src/modules/*/*.router.ts`

These files decide:
- which URL is handled
- which validation schema is used
- which service method is called
- how the response is returned

Example pattern:
- route receives request
- route calls service
- service calls DB or other services
- route returns JSON response

### 2. Services
Files under `apps/api/src/modules/*/*.service.ts`

These files hold the real business logic.

Examples from this project:
- `auth.service.ts` handles login, refresh token, registration, forgot password
- `customer.service.ts` handles profile and dashboard data
- `document.service.ts` handles upload targets, downloads, status changes

This is the key place where the app rules live.

### 3. Entities
Files under `apps/api/src/entities/*.entity.ts` and module entity files

These define the database model. Each entity represents a table or table-like structure.

Examples:
- `UserEntity`
- `DocumentEntity`
- `RefreshTokenEntity`
- `InvoiceEntity`

The entity file explains the table columns, relationships, and constraints.

### 4. Config files
Files under `apps/api/src/config/`

These contain setup code for:
- environment variables
- database connection
- Redis connection

This directory is the foundation of the app startup pipeline.

### 5. Middleware
Files under `apps/api/src/middleware/`

These handle:
- authentication
- authorization
- validation
- error handling

This keeps validation and security separate from route logic.

### 6. Utilities
Files under `apps/api/src/utils/`

These hold shared helpers:
- HTTP error class
- S3 logic
- response helpers
- logger helpers

## Request lifecycle in this project

A typical request flow:

1. `app.ts` creates the Express app.
2. Global middleware runs: helmet, cors, compression, rate limiter, JSON parsing.
3. Route registration attaches `/api/auth`, `/api/users`, `/api/documents`, etc.
4. For protected routes, `authenticate` checks the JWT token.
5. `authorize` checks user role.
6. `validate` confirms incoming data shape.
7. Service performs business logic and database operations.
8. Response is returned in a standard envelope.

## Why the project is organized this way

This structure makes the code easier to maintain because:
- routes stay clean
- services are reusable
- DB logic is centralized
- changes to one module are isolated
- security checks are placed in middleware

## Project startup flow

The application bootstrap is defined by:
- `apps/api/src/server.ts`
- `apps/api/src/config/database.ts`
- `apps/api/src/config/redis.ts`

Sequence:
1. connect to Postgres
2. run migrations
3. connect to Redis
4. create Express app
5. listen on port 3000

## Docker startup flow

The containers are coordinated by:
- `compose.yml` for local development
- `compose.prod.yml` for production

The app does not run as a single giant process. Instead:
- Nginx routes traffic
- API serves requests
- Worker runs background tasks
- Database and Redis remain separate services

This keeps operations predictable and easier to scale.

## Security model

Important layers in the app:
- `helmet` for HTTP security headers
- `cors` for origin restrictions
- `rateLimit` to reduce abuse
- JWT auth for protected routes
- role checks for customer vs admin workflows
- environment validation for secret configuration

## Best way to learn the project

Study in this order:
1. `apps/api/src/server.ts`
2. `apps/api/src/app.ts`
3. `apps/api/src/config/database.ts`
4. `apps/api/src/config/redis.ts`
5. `apps/api/src/middleware/authenticate.ts`
6. `apps/api/src/modules/auth/auth.service.ts`
7. `apps/api/src/modules/documents/document.service.ts`
8. `apps/api/src/migrations/1700000000000-InitialSchema.ts`

This sequence teaches project startup, auth, logic, and database structure.
