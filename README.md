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

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjdXN0XzAyIiwiaWF0IjoxNzcwNzg2OTMzLCJleHAiOjE3NzA3ODc4MzN9.FBBJH6LiMXZcDqrchbItVnbJJmGFov84zb51j-Ipy-g",
"refreshToken": "a0d664e5-1450-4d29-b538-4f43133be854
