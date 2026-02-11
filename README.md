# Bank API

A RESTful banking API built with Hono, Prisma, and PostgreSQL. Supports customer management, accounts, transactions, transfers, payments, cards, deposits, withdrawals, and identity verification.

## Prerequisites

- Node.js (v20+)
- Docker (for PostgreSQL)

## Getting Started

```bash
# Install dependencies
npm install

# Start PostgreSQL
docker compose up -d

# Copy environment config
cp .env.example .env

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Seed the database with sample data
npm run db:seed

# Start dev server (with hot reload)
npm run dev
```

The server runs at `http://localhost:3000`.

## Scripts

| Command               | Description                                  |
| --------------------- | -------------------------------------------- |
| `npm run dev`         | Start dev server with hot reload (tsx watch) |
| `npm run build`       | Compile TypeScript to `dist/`                |
| `npm start`           | Run compiled build                           |
| `npm run db:generate` | Generate Prisma client                       |
| `npm run db:migrate`  | Run Prisma migrations                        |
| `npm run db:push`     | Push schema changes without migration        |
| `npm run db:studio`   | Open Prisma Studio GUI                       |
| `npm run db:seed`     | Seed database with sample data               |

## API Endpoints

All endpoints are under `/api/v1`. Authenticated routes require a `Authorization: Bearer <token>` header.

### Authentication

| Method | Path                   | Auth | Description               |
| ------ | ---------------------- | ---- | ------------------------- |
| `POST` | `/api/v1/auth/login`   | No   | Login with email/password |
| `POST` | `/api/v1/auth/refresh` | No   | Refresh access token      |
| `POST` | `/api/v1/auth/logout`  | Yes  | Invalidate refresh token  |

### Identity Verification

| Method | Path                         | Auth | Description                            |
| ------ | ---------------------------- | ---- | -------------------------------------- |
| `POST` | `/api/v1/auth/verify/start`  | No   | Start phone-based verification session |
| `POST` | `/api/v1/auth/verify/answer` | No   | Answer a verification question         |

### Customers

| Method   | Path                    | Auth | Description                     |
| -------- | ----------------------- | ---- | ------------------------------- |
| `POST`   | `/api/v1/customers`     | Yes  | Create customer                 |
| `GET`    | `/api/v1/customers`     | Yes  | List customers (scoped to self) |
| `GET`    | `/api/v1/customers/:id` | Yes  | Get customer details            |
| `PATCH`  | `/api/v1/customers/:id` | Yes  | Update customer                 |
| `DELETE` | `/api/v1/customers/:id` | Yes  | Delete customer                 |

### Accounts

| Method  | Path                                       | Auth | Description                    |
| ------- | ------------------------------------------ | ---- | ------------------------------ |
| `POST`  | `/api/v1/accounts`                         | Yes  | Create account                 |
| `GET`   | `/api/v1/accounts`                         | Yes  | List accounts (scoped to self) |
| `GET`   | `/api/v1/accounts/:id`                     | Yes  | Get account details            |
| `GET`   | `/api/v1/accounts/:id/balance`             | Yes  | Get account balance            |
| `PATCH` | `/api/v1/accounts/:id`                     | Yes  | Update account status          |
| `GET`   | `/api/v1/accounts/:accountId/transactions` | Yes  | List account transactions      |

### Transactions

| Method | Path                       | Auth | Description             |
| ------ | -------------------------- | ---- | ----------------------- |
| `GET`  | `/api/v1/transactions/:id` | Yes  | Get transaction details |

### Transfers

| Method | Path                    | Auth | Description                      |
| ------ | ----------------------- | ---- | -------------------------------- |
| `POST` | `/api/v1/transfers`     | Yes  | Create transfer between accounts |
| `GET`  | `/api/v1/transfers/:id` | Yes  | Get transfer details             |

### Payments

| Method | Path                   | Auth | Description                   |
| ------ | ---------------------- | ---- | ----------------------------- |
| `POST` | `/api/v1/payments`     | Yes  | Create payment to beneficiary |
| `GET`  | `/api/v1/payments`     | Yes  | List payments                 |
| `GET`  | `/api/v1/payments/:id` | Yes  | Get payment details           |

### Cards

| Method   | Path                | Auth | Description              |
| -------- | ------------------- | ---- | ------------------------ |
| `POST`   | `/api/v1/cards`     | Yes  | Create card              |
| `GET`    | `/api/v1/cards`     | Yes  | List cards               |
| `GET`    | `/api/v1/cards/:id` | Yes  | Get card details         |
| `PATCH`  | `/api/v1/cards/:id` | Yes  | Update card status/limit |
| `DELETE` | `/api/v1/cards/:id` | Yes  | Cancel card              |

### Deposits

| Method | Path                   | Auth | Description         |
| ------ | ---------------------- | ---- | ------------------- |
| `POST` | `/api/v1/deposits`     | Yes  | Create deposit      |
| `GET`  | `/api/v1/deposits/:id` | Yes  | Get deposit details |

### Withdrawals

| Method | Path                      | Auth | Description            |
| ------ | ------------------------- | ---- | ---------------------- |
| `POST` | `/api/v1/withdrawals`     | Yes  | Create withdrawal      |
| `GET`  | `/api/v1/withdrawals/:id` | Yes  | Get withdrawal details |

## Authentication Flow

1. **Login**: `POST /api/v1/auth/login` with `{ email, password }` returns an `accessToken` (JWT, 15min expiry) and `refreshToken` (7 day expiry).
2. **Use token**: Pass `Authorization: Bearer <accessToken>` on authenticated requests.
3. **Refresh**: `POST /api/v1/auth/refresh` with `{ refreshToken }` to get a new access token.
4. **Verification**: An alternative auth flow via phone-based KBA (knowledge-based authentication). Start a session with a phone number, then answer weighted security questions to reach a 75% confidence threshold.

## Idempotency

Mutating endpoints (POST) support an `Idempotency-Key` header. If the same key is sent again with the same route and body, the original response is returned. If the body differs, a `409 Conflict` is returned.

## Pagination

List endpoints accept `page` (default 1) and `limit` (default 20, max 100) query parameters and return:

```json
{
  "data": [],
  "meta": { "total": 0, "page": 1, "limit": 20, "totalPages": 0 }
}
```

## Seed Data

After running `npm run db:seed`, these accounts are available:

| Email                    | Password      | Customer ID |
| ------------------------ | ------------- | ----------- |
| `john.doe@example.com`   | `password123` | `cust_01`   |
| `jane.smith@example.com` | `password456` | `cust_02`   |
| `bob.wilson@example.com` | `password789` | `cust_03`   |

## Error Format

All errors follow this structure:

```json
{
  "status": 422,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": [{ "field": "email", "message": "Email is required" }]
}
```

## Note on Monetary Values

All monetary amounts (balance, transaction amounts, card limits, etc.) are represented in **cents** (integer). For example, `250000` = $2,500.00.

## Deployment (Coolify VPS)

This API is designed to be deployed on a Coolify-managed VPS. Coolify handles Docker builds, reverse proxy (Traefik/Caddy), TLS termination, and environment variable management.

### 1. Create a PostgreSQL Database

In the Coolify dashboard, add a new **PostgreSQL** service (16+). Coolify provisions persistent storage automatically. Copy the internal connection URL — it will look like:

```
postgresql://postgres:<password>@<service-name>:5432/bank_api
```

### 2. Add the API Application

Add a new application in Coolify and point it at your Git repository. Coolify auto-detects the `Dockerfile` — no build arguments or build packs needed.

### 3. Set Environment Variables

In the Coolify application settings, add these environment variables:

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://postgres:pass@db:5432/bank_api` | PostgreSQL connection string |
| `JWT_SECRET` | Yes | *(generate with `openssl rand -hex 32`)* | Secret for signing JWTs |
| `CORS_ORIGIN` | Yes | `https://app.yourbank.com` | Comma-separated allowed origins |
| `ADMIN_EMAIL` | Yes | `admin@yourbank.com` | Initial admin employee email |
| `ADMIN_PASSWORD` | Yes | *(strong password)* | Initial admin employee password |
| `PORT` | No | `3000` | Server port (default: `3000`, matches Dockerfile) |

### 4. Configure Health Check

Set the health check in Coolify to:

- **Path:** `/health`
- **Port:** `3000`

The endpoint returns `{ "status": "ok", "database": "connected" }` when healthy, or HTTP 503 when the database is unreachable.

### 5. Deploy

Push to your configured branch. Coolify will:

1. Build the Docker image (multi-stage: deps → build → production)
2. Run `prisma migrate deploy` on container start (applies pending migrations)
3. Start the Node.js server on port 3000
4. Seed the initial admin employee from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (if not already created)

### 6. Verify

```bash
# Health check
curl https://your-api-domain.com/health

# Admin login
curl -X POST https://your-api-domain.com/api/v1/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourbank.com","password":"your-admin-password"}'
```

### How It Works

- **TLS:** Coolify's reverse proxy handles HTTPS termination. The API detects `x-forwarded-proto: https` and sets HSTS headers automatically.
- **Migrations:** Run automatically on every container start via `prisma migrate deploy` in the Dockerfile CMD. No manual migration step needed.
- **Persistent storage:** Not required for the API container (stateless). PostgreSQL storage is managed by Coolify.
- **Scaling:** The API is stateless and can be scaled horizontally. Note that rate limiting is in-memory, so each instance has its own counters — consider Redis-backed rate limiting if running multiple instances.
- **Cleanup jobs:** Expired idempotency records and refresh tokens are automatically cleaned up every hour.
