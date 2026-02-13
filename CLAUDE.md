# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start PostgreSQL
docker compose up -d

# Generate Prisma client (after schema changes)
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database (3 customers, 6 accounts, transactions, transfers, cards)
npm run db:seed

# Dev server with hot reload
npm run dev

# Build
npm run build
```

## Environment

Requires `.env` with `DATABASE_URL` and `JWT_SECRET` (see `.env.example`). PostgreSQL 16 via Docker Compose.

## Architecture

**Framework**: Hono on Node.js (`@hono/node-server`), ESM modules with `.js` extensions in imports.

**Database**: Prisma 7 with `@prisma/adapter-pg` (driver adapter, not the default engine). Client is generated to `src/generated/prisma/`. All monetary values are stored as **integers in cents**.

**Structure**:
- `src/routes/` — Hono route handlers. Each file creates a `new Hono<AppEnv>()` and exports it. Mounted under `/api/v1/` in `src/index.ts`.
- `src/services/` — Business logic layer. Routes call services; services call Prisma. Financial operations (transfers, deposits, withdrawals) use `prisma.$transaction()` for atomicity.
- `src/lib/` — Shared utilities (Prisma client, auth JWT helpers, error handling, pagination, idempotency, authorization checks).
- `src/middleware/` — Auth middleware extracts `customerId` from JWT Bearer token and sets it on context.

**Key patterns**:
- **Error handling**: Throw `AppError(status, code, message, details?)` from `src/lib/errors.ts`. The global `errorHandler` catches and formats them.
- **Authorization**: `assertAccountOwnership(accountId, customerId)` and `assertCustomerOwnership()` from `src/lib/authorization.ts` enforce ownership. Called in routes before service calls.
- **Idempotency**: Mutating routes use `idempotencyMiddleware`. When present, body is accessed via `c.get('parsedBody') || (await c.req.json())`.
- **Pagination**: Uses `parsePagination(query)` → `{ page, limit, skip }` and `paginatedResponse(data, total, page, limit)`.
- **Validation**: `validate(zodSchema, data)` from `src/lib/validation.ts` — throws `AppError(422, 'VALIDATION_ERROR', ...)` with field-level details.
- **Auth**: JWT access tokens (15min) via `hono/jwt`. Refresh tokens stored in DB.
- **Types**: `AppEnv` in `src/lib/types.ts` defines Hono context variables (`customerId`, `parsedBody`, idempotency fields).
