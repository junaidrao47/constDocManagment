# Postgres + TypeORM Guide for Beginners

This project uses Postgres as the main relational database and TypeORM as the object mapping layer. The goal is to keep database logic organized, typed, and easy to migrate.

## Why Postgres?

Postgres is a strong choice because it supports:
- relational data with clear relationships
- structured tables for users, documents, quotes, invoices, and subscriptions
- indexes and constraints for performance and integrity
- JSON-friendly features when needed
- reliable behavior in production systems

In this project, Postgres stores the core business data.

## Why TypeORM?

TypeORM helps connect JavaScript/TypeScript code to Postgres tables using entities.

Instead of writing raw SQL everywhere, we define models like:
- `UserEntity`
- `DocumentEntity`
- `QuotationEntity`
- `SubscriptionEntity`

Then TypeORM can:
- create query objects
- generate SQL for insert/update/select
- manage relationships
- run migrations
- validate column types

## How this project configures TypeORM

The database setup lives in `apps/api/src/config/database.ts`.

Key parts:
- `type: "postgres"`
- `url: env.databaseUrl`
- `entities: [...]`
- `migrations: ["src/migrations/*{.ts,.js}"]`
- `synchronize: false`

This means:
- the app connects to Postgres using the DATABASE_URL
- TypeORM loads all entity definitions
- migrations are used to evolve the schema
- auto-sync is disabled for safety in production

## Why migrations matter

A migration is a versioned change to the database schema.

Example:
- add a new table
- add a column
- add an index
- set a foreign key

This is needed because production databases should not be changed by hand. Migrations help you:
- apply changes in a controlled order
- roll back or review schema updates
- keep local and production databases consistent
- avoid accidental data loss

In this project, the first migration is located at:
`apps/api/src/migrations/1700000000000-InitialSchema.ts`

That file creates tables such as:
- users
- services
- packages
- quotations
- subscriptions
- documents
- invoices
- payments
- notifications

## How the initial schema is built

The migration uses `QueryRunner.query()` to issue SQL.

It creates:
- enum types for roles and document status
- tables with primary keys and unique constraints
- foreign key relationships between tables
- indexes for faster queries

Example:
- users have many documents
- quotations belong to a customer
- invoices belong to a customer and optional subscription
- document history tracks status changes

## Relationship example

A user can have:
- many refresh tokens
- many quotes
- many documents
- many subscriptions
- many invoices

This is represented with TypeORM decorators such as:
- `@OneToMany`
- `@ManyToOne`
- `@JoinColumn`

These create the relationships between tables.

## Why not use plain SQL everywhere?

Using TypeORM keeps the code cleaner and easier to maintain. Your service layer can do things like:

```ts
const userRepository = AppDataSource.getRepository(UserEntity);
const user = await userRepository.findOne({ where: { email } });
```

This is more readable than manually building SQL strings in many places.

## Production recommendation

For production, use:
- Postgres in a dedicated container or managed service
- persistent volumes for database data
- strict environment secrets
- migrations run automatically on app startup
- no `synchronize: true`

This gives a safer and more predictable deployment flow.

## Simple beginner explanation

Think of it like this:
- Postgres is the storage box
- TypeORM is the translator between TypeScript objects and database tables
- Entities are the table definitions
- Migrations are the change history
- Services are the business logic that asks the database for the data it needs

## This project specifically

The app keeps the database design close to the business needs:
- `users` handle authentication and roles
- `documents` track uploaded customer files and review status
- `quotations` handle pricing and services
- `subscriptions` represent active packages
- `invoices` and `payments` track billing
- `notifications_log` tracks email or message delivery

This is a good example of how a backend platform divides data by business domain.

## Important rule for this project

Every schema change must be added as a migration, not done directly in a running database without versioning.

That is the safest and most professional setup.
