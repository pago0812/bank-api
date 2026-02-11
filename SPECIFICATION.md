# Bank Simulation API — Specification

## 1. Overview

A bank simulation API for testing and development purposes. It models the core operations of a retail bank: customer management, accounts, transactions, transfers, payments, cards, deposits, and withdrawals. It also supports a call-center identity verification flow.

### Tech Stack

- **Runtime**: Node.js
- **Framework**: Hono
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT (access + refresh tokens)

### Base URL

```
/api/v1
```

### Access Patterns

1. **Direct login** — Customer authenticates with email and password, receives JWT.
2. **Call center identity verification** — An agent provides a customer's phone number, answers verification questions to accumulate confidence, and upon reaching the 75% threshold receives a JWT to act on behalf of that customer.

---

## 2. Conventions

### 2.1 Authentication

All authenticated endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

- **Access token**: JWT, expires in **15 minutes**.
- **Refresh token**: opaque token stored in DB, expires in **7 days**.
- Tokens issued via login (`POST /auth/login`) or identity verification (`POST /auth/verify/answer` when confidence >= 75%).

### 2.2 Error Response Format

All errors return a consistent JSON structure:

```json
{
  "status": 422,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

| Field     | Type             | Description                                  |
|-----------|------------------|----------------------------------------------|
| `status`  | `number`         | HTTP status code                             |
| `code`    | `string`         | Machine-readable error code (UPPER_SNAKE)    |
| `message` | `string`         | Human-readable summary                       |
| `details` | `array \| null`  | Field-level errors or additional info        |

#### Standard Error Codes

| Code                    | HTTP Status | When                                       |
|-------------------------|-------------|--------------------------------------------|
| `VALIDATION_ERROR`      | 422         | Request body/params fail validation        |
| `UNAUTHORIZED`          | 401         | Missing or invalid token                   |
| `FORBIDDEN`             | 403         | Token valid but insufficient permissions   |
| `NOT_FOUND`             | 404         | Resource does not exist                    |
| `CONFLICT`              | 409         | Duplicate resource or idempotency conflict |
| `INSUFFICIENT_FUNDS`    | 422         | Balance too low for operation              |
| `ACCOUNT_FROZEN`        | 422         | Account is frozen, cannot transact         |
| `ACCOUNT_CLOSED`        | 422         | Account is closed, read-only               |
| `CARD_NOT_ACTIVE`       | 422         | Card is not in ACTIVE status               |
| `DAILY_LIMIT_EXCEEDED`  | 422         | Card daily limit would be exceeded         |
| `SESSION_EXPIRED`       | 422         | Verification session has expired           |
| `VERIFICATION_FAILED`   | 401         | Identity verification failed               |
| `INTERNAL_ERROR`        | 500         | Unexpected server error                    |

### 2.3 Pagination

All list endpoints accept:

| Param   | Type     | Default | Description              |
|---------|----------|---------|--------------------------|
| `page`  | `number` | `1`     | Page number (1-indexed)  |
| `limit` | `number` | `20`    | Items per page (max 100) |

Paginated responses return:

```json
{
  "data": [],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

### 2.4 Money Handling

All monetary amounts are stored and transmitted as **integers in cents** (e.g., `$10.50` = `1050`). This avoids floating-point precision issues.

### 2.5 Idempotency

All `POST` and `PATCH` endpoints accept an optional `Idempotency-Key` header:

```
Idempotency-Key: <unique-string>
```

- If a request with the same key has been processed before, the original response is returned.
- Keys are stored for 24 hours.
- If the key exists but the request body differs, a `409 CONFLICT` is returned.

### 2.6 Timestamps

All timestamps are in **ISO 8601** format, **UTC timezone**:

```
2025-01-15T10:30:00.000Z
```

---

## 3. Data Models (Prisma Schema)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum AccountType {
  CHECKING
  SAVINGS
}

enum AccountStatus {
  ACTIVE
  FROZEN
  CLOSED
}

enum TransactionType {
  CREDIT
  DEBIT
}

enum TransactionStatus {
  PENDING
  COMPLETED
  FAILED
}

enum TransferStatus {
  PENDING
  COMPLETED
  FAILED
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
}

enum CardType {
  DEBIT
  CREDIT
}

enum CardStatus {
  ACTIVE
  BLOCKED
  EXPIRED
  CANCELLED
}

enum DepositStatus {
  PENDING
  COMPLETED
  FAILED
}

enum WithdrawalStatus {
  PENDING
  COMPLETED
  FAILED
}

enum VerificationSessionStatus {
  IN_PROGRESS
  VERIFIED
  FAILED
  EXPIRED
}

enum CustomerStatus {
  ACTIVE
  SUSPENDED
  CLOSED
}

model Customer {
  id          String         @id @default(uuid())
  email       String         @unique
  password    String         // bcrypt hash
  firstName   String
  lastName    String
  dateOfBirth DateTime
  phone       String         @unique
  address     String         // full address string
  zipCode     String
  status      CustomerStatus @default(ACTIVE)
  kycVerified Boolean        @default(false)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  accounts             Account[]
  refreshTokens        RefreshToken[]
  verificationSessions VerificationSession[]
}

model Account {
  id            String        @id @default(uuid())
  customerId    String
  accountNumber String        @unique // 10-digit number
  type          AccountType
  currency      String        @default("USD")
  balance       Int           @default(0) // in cents
  status        AccountStatus @default(ACTIVE)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  customer     Customer      @relation(fields: [customerId], references: [id])
  transactions Transaction[]
  cards        Card[]
  deposits     Deposit[]
  withdrawals  Withdrawal[]

  transfersFrom Transfer[] @relation("TransferFrom")
  transfersTo   Transfer[] @relation("TransferTo")
  payments      Payment[]
}

model Transaction {
  id                String            @id @default(uuid())
  accountId         String
  type              TransactionType
  amount            Int               // in cents, always positive
  balanceAfter      Int               // in cents
  description       String
  reference         String            @unique @default(uuid())
  status            TransactionStatus @default(COMPLETED)
  counterpartyName  String?
  counterpartyBank  String?
  createdAt         DateTime          @default(now())

  account Account @relation(fields: [accountId], references: [id])
}

model Transfer {
  id            String         @id @default(uuid())
  fromAccountId String
  toAccountId   String
  amount        Int            // in cents
  description   String?
  status        TransferStatus @default(PENDING)
  reference     String         @unique @default(uuid())
  createdAt     DateTime       @default(now())

  fromAccount Account @relation("TransferFrom", fields: [fromAccountId], references: [id])
  toAccount   Account @relation("TransferTo", fields: [toAccountId], references: [id])
}

model Payment {
  id                 String        @id @default(uuid())
  accountId          String
  amount             Int           // in cents
  beneficiaryName    String
  beneficiaryBank    String
  beneficiaryAccount String
  reference          String        @unique @default(uuid())
  description        String?
  status             PaymentStatus @default(PENDING)
  createdAt          DateTime      @default(now())

  account Account @relation(fields: [accountId], references: [id])
}

model Card {
  id           String     @id @default(uuid())
  accountId    String
  cardNumber   String     @unique // stored encrypted/hashed
  maskedNumber String     // e.g. "****-****-****-1234"
  expiryDate   String     // MM/YY format
  cvv          String     // stored hashed, never returned after creation
  type         CardType
  status       CardStatus @default(ACTIVE)
  dailyLimit   Int        @default(500000) // in cents ($5,000)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  account Account @relation(fields: [accountId], references: [id])
}

model Deposit {
  id        String        @id @default(uuid())
  accountId String
  amount    Int           // in cents
  reference String        @unique @default(uuid())
  source    String        // e.g. "CASH", "CHECK", "WIRE"
  status    DepositStatus @default(COMPLETED)
  createdAt DateTime      @default(now())

  account Account @relation(fields: [accountId], references: [id])
}

model Withdrawal {
  id        String           @id @default(uuid())
  accountId String
  amount    Int              // in cents
  reference String           @unique @default(uuid())
  channel   String           // e.g. "ATM", "TELLER", "ONLINE"
  status    WithdrawalStatus @default(COMPLETED)
  createdAt DateTime         @default(now())

  account Account @relation(fields: [accountId], references: [id])
}

model VerificationSession {
  id             String                    @id @default(uuid())
  phoneNumber    String
  customerId     String?
  status         VerificationSessionStatus @default(IN_PROGRESS)
  confidence     Float                     @default(0) // 0.0 to 1.0
  questionsAsked Json                      @default("[]") // array of question IDs asked
  correctAnswers Int                       @default(0)
  createdAt      DateTime                  @default(now())
  expiresAt      DateTime                  // createdAt + 10 minutes

  customer Customer? @relation(fields: [customerId], references: [id])
}

model RefreshToken {
  id         String   @id @default(uuid())
  customerId String
  token      String   @unique
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  customer Customer @relation(fields: [customerId], references: [id])
}

model IdempotencyRecord {
  key       String   @id
  route     String   // method + path
  body      String   // hashed request body
  response  Json     // stored response
  status    Int      // HTTP status code
  createdAt DateTime @default(now())
}
```

---

## 4. Endpoints

### 4.1 Auth

#### `POST /api/v1/auth/login`

Authenticate a customer with email and password.

**Auth**: None

**Request Body**:

| Field      | Type     | Required | Description        |
|------------|----------|----------|--------------------|
| `email`    | `string` | Yes      | Customer email     |
| `password` | `string` | Yes      | Customer password  |

**Request Example**:

```json
{
  "email": "john.doe@example.com",
  "password": "securePassword123"
}
```

**Response `200 OK`**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "expiresIn": 900,
  "customer": {
    "id": "cust_01",
    "email": "john.doe@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Error `401 UNAUTHORIZED`**:

```json
{
  "status": 401,
  "code": "UNAUTHORIZED",
  "message": "Invalid email or password",
  "details": null
}
```

**Business Rules**:
- Customer status must be ACTIVE. Suspended/closed customers cannot log in.
- Password is compared using bcrypt.
- A new refresh token is created and stored on every login.

---

#### `POST /api/v1/auth/refresh`

Exchange a valid refresh token for a new access token.

**Auth**: None

**Request Body**:

| Field          | Type     | Required | Description    |
|----------------|----------|----------|----------------|
| `refreshToken` | `string` | Yes      | Refresh token  |

**Request Example**:

```json
{
  "refreshToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Response `200 OK`**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
}
```

**Error `401 UNAUTHORIZED`**:

```json
{
  "status": 401,
  "code": "UNAUTHORIZED",
  "message": "Invalid or expired refresh token",
  "details": null
}
```

**Business Rules**:
- The refresh token must exist in the database and not be expired.
- A new access token is issued; the refresh token itself is NOT rotated.
- If the token is expired, it is deleted from the database.

---

#### `POST /api/v1/auth/logout`

Invalidate the current refresh token.

**Auth**: Bearer token

**Request Body**:

| Field          | Type     | Required | Description    |
|----------------|----------|----------|----------------|
| `refreshToken` | `string` | Yes      | Refresh token  |

**Request Example**:

```json
{
  "refreshToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Response `200 OK`**:

```json
{
  "message": "Logged out successfully"
}
```

**Business Rules**:
- The refresh token is deleted from the database.
- The access token remains valid until it expires (stateless JWT).
- If the refresh token does not exist, still return 200 (idempotent).

---

### 4.2 Identity Verification

#### `POST /api/v1/auth/verify/start`

Start an identity verification session by phone number. Used by call center agents.

**Auth**: None

**Request Body**:

| Field         | Type     | Required | Description                    |
|---------------|----------|----------|--------------------------------|
| `phoneNumber` | `string` | Yes      | Customer's registered phone    |

**Request Example**:

```json
{
  "phoneNumber": "+1234567890"
}
```

**Response `200 OK`**:

```json
{
  "sessionId": "vs_01",
  "status": "IN_PROGRESS",
  "question": {
    "id": "full_name",
    "text": "What is the customer's full name?"
  },
  "expiresAt": "2025-01-15T10:40:00.000Z"
}
```

**Error `404 NOT_FOUND`**:

```json
{
  "status": 404,
  "code": "NOT_FOUND",
  "message": "No customer found with this phone number",
  "details": null
}
```

**Business Rules**:
- Looks up the customer by phone number. If no match, returns 404.
- Creates a `VerificationSession` record with `expiresAt` = now + 10 minutes.
- Selects the first question from the available pool (random order, higher-weight questions prioritized).
- The "Registered phone number" question is **skipped** since the phone was used to start the session.
- If the customer has no cards, the "Last 4 digits of card" question is also skipped.

---

#### `POST /api/v1/auth/verify/answer`

Submit an answer to the current verification question.

**Auth**: None

**Request Body**:

| Field       | Type     | Required | Description                           |
|-------------|----------|----------|---------------------------------------|
| `sessionId` | `string` | Yes      | Verification session ID               |
| `questionId`| `string` | Yes      | ID of the question being answered     |
| `answer`    | `string` | Yes      | The agent's answer                    |

**Request Example**:

```json
{
  "sessionId": "vs_01",
  "questionId": "full_name",
  "answer": "John Doe"
}
```

**Response `200 OK` — Next question** (confidence < 75%, more questions available):

```json
{
  "sessionId": "vs_01",
  "status": "IN_PROGRESS",
  "correct": true,
  "confidence": 0.10,
  "nextQuestion": {
    "id": "date_of_birth",
    "text": "What is the customer's date of birth?"
  }
}
```

**Response `200 OK` — Verification passed** (confidence >= 75%):

```json
{
  "sessionId": "vs_01",
  "status": "VERIFIED",
  "correct": true,
  "confidence": 0.80,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "customer": {
    "id": "cust_01",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Response `200 OK` — Verification failed** (all questions exhausted, confidence < 75%):

```json
{
  "sessionId": "vs_01",
  "status": "FAILED",
  "correct": false,
  "confidence": 0.40,
  "message": "Identity verification failed. Insufficient confidence score."
}
```

**Error `422 SESSION_EXPIRED`**:

```json
{
  "status": 422,
  "code": "SESSION_EXPIRED",
  "message": "Verification session has expired",
  "details": null
}
```

**Business Rules**:
- Session must exist and have status `IN_PROGRESS`.
- Session must not be expired (check `expiresAt`).
- The `questionId` must match the current expected question.
- See section 5 for full confidence scoring logic.

---

### 4.3 Customers

#### `POST /api/v1/customers`

Create a new customer.

**Auth**: Bearer token

**Request Headers**:

| Header            | Required | Description           |
|-------------------|----------|-----------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field         | Type     | Required | Description                    |
|---------------|----------|----------|--------------------------------|
| `email`       | `string` | Yes      | Unique email address           |
| `password`    | `string` | Yes      | Min 8 characters               |
| `firstName`   | `string` | Yes      | First name                     |
| `lastName`    | `string` | Yes      | Last name                      |
| `dateOfBirth` | `string` | Yes      | ISO 8601 date (YYYY-MM-DD)     |
| `phone`       | `string` | Yes      | Unique phone number            |
| `address`     | `string` | Yes      | Full address                   |
| `zipCode`     | `string` | Yes      | ZIP / postal code              |

**Request Example**:

```json
{
  "email": "jane.smith@example.com",
  "password": "securePass456",
  "firstName": "Jane",
  "lastName": "Smith",
  "dateOfBirth": "1990-05-20",
  "phone": "+1987654321",
  "address": "456 Oak Ave, Los Angeles, CA",
  "zipCode": "90001"
}
```

**Response `201 Created`**:

```json
{
  "id": "cust_02",
  "email": "jane.smith@example.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "dateOfBirth": "1990-05-20T00:00:00.000Z",
  "phone": "+1987654321",
  "address": "456 Oak Ave, Los Angeles, CA",
  "zipCode": "90001",
  "status": "ACTIVE",
  "kycVerified": false,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Error `409 CONFLICT`**:

```json
{
  "status": 409,
  "code": "CONFLICT",
  "message": "A customer with this email already exists",
  "details": null
}
```

**Business Rules**:
- Email and phone must be unique.
- Password is hashed with bcrypt before storage.
- Password is never returned in any response.

---

#### `GET /api/v1/customers`

List all customers with pagination.

**Auth**: Bearer token

**Query Params**:

| Param    | Type     | Default | Description               |
|----------|----------|---------|---------------------------|
| `page`   | `number` | `1`     | Page number               |
| `limit`  | `number` | `20`    | Items per page (max 100)  |
| `search` | `string` | —       | Search by name or email   |
| `status` | `string` | —       | Filter by status          |

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "cust_01",
      "email": "john.doe@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "dateOfBirth": "1985-03-15T00:00:00.000Z",
      "phone": "+1234567890",
      "address": "123 Main St, New York, NY",
      "zipCode": "10001",
      "status": "ACTIVE",
      "kycVerified": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

#### `GET /api/v1/customers/:id`

Get a single customer by ID.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description  |
|-------|----------|--------------|
| `id`  | `string` | Customer ID  |

**Response `200 OK`**:

```json
{
  "id": "cust_01",
  "email": "john.doe@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1985-03-15T00:00:00.000Z",
  "phone": "+1234567890",
  "address": "123 Main St, New York, NY",
  "zipCode": "10001",
  "status": "ACTIVE",
  "kycVerified": true,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

**Error `404 NOT_FOUND`**:

```json
{
  "status": 404,
  "code": "NOT_FOUND",
  "message": "Customer not found",
  "details": null
}
```

---

#### `PATCH /api/v1/customers/:id`

Update a customer's details.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description  |
|-------|----------|--------------|
| `id`  | `string` | Customer ID  |

**Request Body** (all fields optional):

| Field         | Type     | Description                 |
|---------------|----------|-----------------------------|
| `firstName`   | `string` | First name                  |
| `lastName`    | `string` | Last name                   |
| `phone`       | `string` | Phone number                |
| `address`     | `string` | Full address                |
| `zipCode`     | `string` | ZIP / postal code           |
| `status`      | `string` | ACTIVE, SUSPENDED, CLOSED   |
| `kycVerified` | `boolean`| KYC verification status     |

**Request Example**:

```json
{
  "address": "789 Pine St, Chicago, IL",
  "zipCode": "60601"
}
```

**Response `200 OK`**:

```json
{
  "id": "cust_01",
  "email": "john.doe@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1985-03-15T00:00:00.000Z",
  "phone": "+1234567890",
  "address": "789 Pine St, Chicago, IL",
  "zipCode": "60601",
  "status": "ACTIVE",
  "kycVerified": true,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-15T11:00:00.000Z"
}
```

**Business Rules**:
- Email and dateOfBirth cannot be changed after creation.
- Phone must remain unique if updated.

---

#### `DELETE /api/v1/customers/:id`

Delete a customer. Sets status to CLOSED (soft delete).

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description  |
|-------|----------|--------------|
| `id`  | `string` | Customer ID  |

**Response `200 OK`**:

```json
{
  "message": "Customer deleted successfully"
}
```

**Business Rules**:
- Soft delete: sets status to CLOSED.
- All associated accounts are also set to CLOSED.
- All associated cards are set to CANCELLED.
- All refresh tokens for this customer are deleted.

---

### 4.4 Accounts

#### `POST /api/v1/accounts`

Create a new account for a customer.

**Auth**: Bearer token

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field        | Type     | Required | Description                          |
|--------------|----------|----------|--------------------------------------|
| `customerId` | `string` | Yes      | Owner customer ID                    |
| `type`       | `string` | Yes      | `CHECKING` or `SAVINGS`             |
| `currency`   | `string` | No       | ISO 4217 currency code (default: USD)|

**Request Example**:

```json
{
  "customerId": "cust_01",
  "type": "SAVINGS",
  "currency": "USD"
}
```

**Response `201 Created`**:

```json
{
  "id": "acc_04",
  "customerId": "cust_01",
  "accountNumber": "1234567890",
  "type": "SAVINGS",
  "currency": "USD",
  "balance": 0,
  "status": "ACTIVE",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Business Rules**:
- Account number is auto-generated (10-digit random unique number).
- Customer must exist and have status ACTIVE.
- Initial balance is 0.

---

#### `GET /api/v1/accounts`

List accounts. Can filter by customer.

**Auth**: Bearer token

**Query Params**:

| Param        | Type     | Default | Description                   |
|--------------|----------|---------|-------------------------------|
| `page`       | `number` | `1`     | Page number                   |
| `limit`      | `number` | `20`    | Items per page (max 100)      |
| `customerId` | `string` | —       | Filter by customer ID         |
| `type`       | `string` | —       | Filter by CHECKING or SAVINGS |
| `status`     | `string` | —       | Filter by account status      |

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "acc_01",
      "customerId": "cust_01",
      "accountNumber": "1000000001",
      "type": "CHECKING",
      "currency": "USD",
      "balance": 250000,
      "status": "ACTIVE",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 6,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

#### `GET /api/v1/accounts/:id`

Get account details by ID.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description  |
|-------|----------|--------------|
| `id`  | `string` | Account ID   |

**Response `200 OK`**:

```json
{
  "id": "acc_01",
  "customerId": "cust_01",
  "accountNumber": "1000000001",
  "type": "CHECKING",
  "currency": "USD",
  "balance": 250000,
  "status": "ACTIVE",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

---

#### `GET /api/v1/accounts/:id/balance`

Get only the balance of an account (lightweight endpoint).

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description  |
|-------|----------|--------------|
| `id`  | `string` | Account ID   |

**Response `200 OK`**:

```json
{
  "accountId": "acc_01",
  "accountNumber": "1000000001",
  "balance": 250000,
  "currency": "USD",
  "asOf": "2025-01-15T10:30:00.000Z"
}
```

---

#### `PATCH /api/v1/accounts/:id`

Update account status.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description  |
|-------|----------|--------------|
| `id`  | `string` | Account ID   |

**Request Body**:

| Field    | Type     | Required | Description                          |
|----------|----------|----------|--------------------------------------|
| `status` | `string` | Yes      | `ACTIVE`, `FROZEN`, or `CLOSED`     |

**Request Example**:

```json
{
  "status": "FROZEN"
}
```

**Response `200 OK`**:

```json
{
  "id": "acc_01",
  "customerId": "cust_01",
  "accountNumber": "1000000001",
  "type": "CHECKING",
  "currency": "USD",
  "balance": 250000,
  "status": "FROZEN",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-15T11:00:00.000Z"
}
```

**Business Rules**:
- CLOSED accounts cannot be reopened (cannot transition from CLOSED to any other status).
- FROZEN accounts can be set to ACTIVE or CLOSED.
- ACTIVE accounts can be set to FROZEN or CLOSED.
- When set to CLOSED, all associated cards are set to CANCELLED.

---

### 4.5 Transactions

Transactions are **read-only records**. They are created automatically by transfers, payments, deposits, and withdrawals. Every transfer creates two transaction records: a DEBIT on the source account and a CREDIT on the destination account.

#### `GET /api/v1/accounts/:accountId/transactions`

List transactions for an account with filters and pagination.

**Auth**: Bearer token

**Path Params**:

| Param       | Type     | Description  |
|-------------|----------|--------------|
| `accountId` | `string` | Account ID   |

**Query Params**:

| Param    | Type     | Default | Description                            |
|----------|----------|---------|----------------------------------------|
| `page`   | `number` | `1`     | Page number                            |
| `limit`  | `number` | `20`    | Items per page (max 100)               |
| `type`   | `string` | —       | Filter by `CREDIT` or `DEBIT`         |
| `status` | `string` | —       | Filter by `PENDING`, `COMPLETED`, `FAILED` |
| `from`   | `string` | —       | Start date (ISO 8601)                  |
| `to`     | `string` | —       | End date (ISO 8601)                    |

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "txn_01",
      "accountId": "acc_01",
      "type": "DEBIT",
      "amount": 5000,
      "balanceAfter": 245000,
      "description": "Transfer to savings",
      "reference": "ref_txn_01",
      "status": "COMPLETED",
      "counterpartyName": null,
      "counterpartyBank": null,
      "createdAt": "2025-01-10T14:00:00.000Z"
    },
    {
      "id": "txn_02",
      "accountId": "acc_01",
      "type": "CREDIT",
      "amount": 150000,
      "balanceAfter": 395000,
      "description": "Salary deposit",
      "reference": "ref_txn_02",
      "status": "COMPLETED",
      "counterpartyName": "Acme Corp",
      "counterpartyBank": null,
      "createdAt": "2025-01-05T09:00:00.000Z"
    }
  ],
  "meta": {
    "total": 25,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

**Business Rules**:
- Transactions are returned in reverse chronological order (newest first).
- The `from` and `to` filters are inclusive.

---

#### `GET /api/v1/transactions/:id`

Get a single transaction by ID.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description    |
|-------|----------|----------------|
| `id`  | `string` | Transaction ID |

**Response `200 OK`**:

```json
{
  "id": "txn_01",
  "accountId": "acc_01",
  "type": "DEBIT",
  "amount": 5000,
  "balanceAfter": 245000,
  "description": "Transfer to savings",
  "reference": "ref_txn_01",
  "status": "COMPLETED",
  "counterpartyName": null,
  "counterpartyBank": null,
  "createdAt": "2025-01-10T14:00:00.000Z"
}
```

---

### 4.6 Transfers

#### `POST /api/v1/transfers`

Create a transfer between two accounts.

**Auth**: Bearer token

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field           | Type     | Required | Description                 |
|-----------------|----------|----------|-----------------------------|
| `fromAccountId` | `string` | Yes      | Source account ID           |
| `toAccountId`   | `string` | Yes      | Destination account ID      |
| `amount`        | `number` | Yes      | Amount in cents             |
| `description`   | `string` | No       | Transfer description        |

**Request Example**:

```json
{
  "fromAccountId": "acc_01",
  "toAccountId": "acc_02",
  "amount": 5000,
  "description": "Monthly savings"
}
```

**Response `201 Created`**:

```json
{
  "id": "trf_01",
  "fromAccountId": "acc_01",
  "toAccountId": "acc_02",
  "amount": 5000,
  "description": "Monthly savings",
  "status": "COMPLETED",
  "reference": "ref_trf_01",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Error `422 INSUFFICIENT_FUNDS`**:

```json
{
  "status": 422,
  "code": "INSUFFICIENT_FUNDS",
  "message": "Insufficient balance in source account",
  "details": {
    "available": 250000,
    "requested": 500000
  }
}
```

**Error `422 ACCOUNT_FROZEN`**:

```json
{
  "status": 422,
  "code": "ACCOUNT_FROZEN",
  "message": "Cannot transfer from a frozen account",
  "details": null
}
```

**Business Rules**:
- Source account must have sufficient balance (`balance >= amount`).
- Both source and destination accounts must have status ACTIVE.
- Both accounts must have the same currency.
- Source and destination must be different accounts.
- Amount must be a positive integer (> 0).
- On success:
  1. Source account balance is decremented by `amount`.
  2. Destination account balance is incremented by `amount`.
  3. A DEBIT transaction is created for the source account.
  4. A CREDIT transaction is created for the destination account.
  5. Transfer status is set to COMPLETED.
- All balance changes and transaction/transfer creation happen in a single database transaction (atomic).

---

#### `GET /api/v1/transfers/:id`

Get a transfer by ID.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description  |
|-------|----------|--------------|
| `id`  | `string` | Transfer ID  |

**Response `200 OK`**:

```json
{
  "id": "trf_01",
  "fromAccountId": "acc_01",
  "toAccountId": "acc_02",
  "amount": 5000,
  "description": "Monthly savings",
  "status": "COMPLETED",
  "reference": "ref_trf_01",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

---

### 4.7 Payments

Payments represent outgoing payments to external beneficiaries.

#### `POST /api/v1/payments`

Create a new payment.

**Auth**: Bearer token

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field                | Type     | Required | Description                    |
|----------------------|----------|----------|--------------------------------|
| `accountId`          | `string` | Yes      | Source account ID              |
| `amount`             | `number` | Yes      | Amount in cents                |
| `beneficiaryName`    | `string` | Yes      | Recipient name                 |
| `beneficiaryBank`    | `string` | Yes      | Recipient bank name            |
| `beneficiaryAccount` | `string` | Yes      | Recipient account number       |
| `description`        | `string` | No       | Payment description            |

**Request Example**:

```json
{
  "accountId": "acc_01",
  "amount": 75000,
  "beneficiaryName": "Electric Company",
  "beneficiaryBank": "National Bank",
  "beneficiaryAccount": "9876543210",
  "description": "January electricity bill"
}
```

**Response `201 Created`**:

```json
{
  "id": "pmt_01",
  "accountId": "acc_01",
  "amount": 75000,
  "beneficiaryName": "Electric Company",
  "beneficiaryBank": "National Bank",
  "beneficiaryAccount": "9876543210",
  "reference": "ref_pmt_01",
  "description": "January electricity bill",
  "status": "PENDING",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Business Rules**:
- Account must exist and be ACTIVE.
- Account must have sufficient balance.
- Amount must be positive (> 0).
- Payment is created with status PENDING (simulates async processing).
- On creation:
  1. Account balance is decremented by `amount`.
  2. A DEBIT transaction with status PENDING is created.
- The payment transitions to COMPLETED automatically after 5 seconds (simulated via a setTimeout or similar mechanism). When it completes, the associated transaction status is also updated to COMPLETED.

---

#### `GET /api/v1/payments/:id`

Get a payment by ID.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description  |
|-------|----------|--------------|
| `id`  | `string` | Payment ID   |

**Response `200 OK`**:

```json
{
  "id": "pmt_01",
  "accountId": "acc_01",
  "amount": 75000,
  "beneficiaryName": "Electric Company",
  "beneficiaryBank": "National Bank",
  "beneficiaryAccount": "9876543210",
  "reference": "ref_pmt_01",
  "description": "January electricity bill",
  "status": "COMPLETED",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

---

#### `GET /api/v1/payments`

List payments with filters and pagination.

**Auth**: Bearer token

**Query Params**:

| Param       | Type     | Default | Description                       |
|-------------|----------|---------|-----------------------------------|
| `page`      | `number` | `1`     | Page number                       |
| `limit`     | `number` | `20`    | Items per page (max 100)          |
| `accountId` | `string` | —       | Filter by account ID              |
| `status`    | `string` | —       | Filter by PENDING, COMPLETED, FAILED |

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "pmt_01",
      "accountId": "acc_01",
      "amount": 75000,
      "beneficiaryName": "Electric Company",
      "beneficiaryBank": "National Bank",
      "beneficiaryAccount": "9876543210",
      "reference": "ref_pmt_01",
      "description": "January electricity bill",
      "status": "COMPLETED",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 4.8 Cards

#### `POST /api/v1/cards`

Issue a new card for an account.

**Auth**: Bearer token

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field        | Type     | Required | Description                        |
|--------------|----------|----------|------------------------------------|
| `accountId`  | `string` | Yes      | Account ID to link the card to     |
| `type`       | `string` | Yes      | `DEBIT` or `CREDIT`               |
| `dailyLimit` | `number` | No       | Daily spending limit in cents (default: 500000 = $5,000) |

**Request Example**:

```json
{
  "accountId": "acc_01",
  "type": "DEBIT",
  "dailyLimit": 100000
}
```

**Response `201 Created`**:

This is the **only** response that includes the full card number and CVV.

```json
{
  "id": "card_01",
  "accountId": "acc_01",
  "cardNumber": "4532015112830366",
  "maskedNumber": "****-****-****-0366",
  "expiryDate": "01/28",
  "cvv": "123",
  "type": "DEBIT",
  "status": "ACTIVE",
  "dailyLimit": 100000,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Business Rules**:
- Account must exist and be ACTIVE.
- Card number is auto-generated (16-digit Luhn-valid number).
- CVV is auto-generated (3-digit random number).
- Expiry date is set to 3 years from creation.
- CVV is **only returned in the creation response** — never again.
- Card number is **only returned in full in the creation response** — all subsequent reads return `maskedNumber` only.

---

#### `GET /api/v1/cards`

List cards with pagination.

**Auth**: Bearer token

**Query Params**:

| Param       | Type     | Default | Description                            |
|-------------|----------|---------|----------------------------------------|
| `page`      | `number` | `1`     | Page number                            |
| `limit`     | `number` | `20`    | Items per page (max 100)               |
| `accountId` | `string` | —       | Filter by account ID                   |
| `status`    | `string` | —       | Filter by ACTIVE, BLOCKED, EXPIRED, CANCELLED |

**Response `200 OK`**:

```json
{
  "data": [
    {
      "id": "card_01",
      "accountId": "acc_01",
      "maskedNumber": "****-****-****-0366",
      "expiryDate": "01/28",
      "type": "DEBIT",
      "status": "ACTIVE",
      "dailyLimit": 100000,
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

Note: `cardNumber` and `cvv` are **never** included in list responses.

---

#### `GET /api/v1/cards/:id`

Get card details by ID.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Card ID     |

**Response `200 OK`**:

```json
{
  "id": "card_01",
  "accountId": "acc_01",
  "maskedNumber": "****-****-****-0366",
  "expiryDate": "01/28",
  "type": "DEBIT",
  "status": "ACTIVE",
  "dailyLimit": 100000,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

Note: `cardNumber` and `cvv` are **never** included in get responses.

---

#### `PATCH /api/v1/cards/:id`

Update card status or daily limit.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Card ID     |

**Request Body** (at least one field required):

| Field        | Type     | Description                                   |
|--------------|----------|-----------------------------------------------|
| `status`     | `string` | `ACTIVE`, `BLOCKED`                          |
| `dailyLimit` | `number` | New daily spending limit in cents             |

**Request Example**:

```json
{
  "status": "BLOCKED"
}
```

**Response `200 OK`**:

```json
{
  "id": "card_01",
  "accountId": "acc_01",
  "maskedNumber": "****-****-****-0366",
  "expiryDate": "01/28",
  "type": "DEBIT",
  "status": "BLOCKED",
  "dailyLimit": 100000,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T11:00:00.000Z"
}
```

**Business Rules**:
- Only ACTIVE cards can be BLOCKED, and vice versa.
- EXPIRED and CANCELLED cards cannot change status.
- Daily limit must be a positive integer.

---

#### `DELETE /api/v1/cards/:id`

Cancel a card (soft delete).

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Card ID     |

**Response `200 OK`**:

```json
{
  "message": "Card cancelled successfully"
}
```

**Business Rules**:
- Sets card status to CANCELLED.
- Already CANCELLED cards return 200 (idempotent).
- EXPIRED cards can also be cancelled.

---

### 4.9 Deposits & Withdrawals

#### `POST /api/v1/deposits`

Create a deposit into an account.

**Auth**: Bearer token

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field       | Type     | Required | Description                       |
|-------------|----------|----------|-----------------------------------|
| `accountId` | `string` | Yes      | Target account ID                 |
| `amount`    | `number` | Yes      | Amount in cents                   |
| `source`    | `string` | Yes      | `CASH`, `CHECK`, or `WIRE`       |

**Request Example**:

```json
{
  "accountId": "acc_01",
  "amount": 100000,
  "source": "CASH"
}
```

**Response `201 Created`**:

```json
{
  "id": "dep_01",
  "accountId": "acc_01",
  "amount": 100000,
  "reference": "ref_dep_01",
  "source": "CASH",
  "status": "COMPLETED",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Business Rules**:
- Account must exist and be ACTIVE.
- Amount must be positive (> 0).
- On creation:
  1. Account balance is incremented by `amount`.
  2. A CREDIT transaction is created with status COMPLETED.
- Deposit status is COMPLETED immediately.

---

#### `GET /api/v1/deposits/:id`

Get a deposit by ID.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Deposit ID  |

**Response `200 OK`**:

```json
{
  "id": "dep_01",
  "accountId": "acc_01",
  "amount": 100000,
  "reference": "ref_dep_01",
  "source": "CASH",
  "status": "COMPLETED",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

---

#### `POST /api/v1/withdrawals`

Create a withdrawal from an account.

**Auth**: Bearer token

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field       | Type     | Required | Description                        |
|-------------|----------|----------|------------------------------------|
| `accountId` | `string` | Yes      | Source account ID                  |
| `amount`    | `number` | Yes      | Amount in cents                    |
| `channel`   | `string` | Yes      | `ATM`, `TELLER`, or `ONLINE`      |

**Request Example**:

```json
{
  "accountId": "acc_01",
  "amount": 20000,
  "channel": "ATM"
}
```

**Response `201 Created`**:

```json
{
  "id": "wth_01",
  "accountId": "acc_01",
  "amount": 20000,
  "reference": "ref_wth_01",
  "channel": "ATM",
  "status": "COMPLETED",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

**Error `422 INSUFFICIENT_FUNDS`**:

```json
{
  "status": 422,
  "code": "INSUFFICIENT_FUNDS",
  "message": "Insufficient balance for withdrawal",
  "details": {
    "available": 250000,
    "requested": 500000
  }
}
```

**Business Rules**:
- Account must exist and be ACTIVE.
- Account must have sufficient balance.
- Amount must be positive (> 0).
- For ATM withdrawals: if the account has an ACTIVE debit card, the daily limit is checked. Sum of today's ATM withdrawals + this amount must not exceed the card's `dailyLimit`.
- On creation:
  1. Account balance is decremented by `amount`.
  2. A DEBIT transaction is created with status COMPLETED.

---

#### `GET /api/v1/withdrawals/:id`

Get a withdrawal by ID.

**Auth**: Bearer token

**Path Params**:

| Param | Type     | Description    |
|-------|----------|----------------|
| `id`  | `string` | Withdrawal ID  |

**Response `200 OK`**:

```json
{
  "id": "wth_01",
  "accountId": "acc_01",
  "amount": 20000,
  "reference": "ref_wth_01",
  "channel": "ATM",
  "status": "COMPLETED",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

---

## 5. Identity Verification Flow

### Purpose

Supports call-center operations where an agent verifies a customer's identity over the phone. The agent provides the customer's phone number, then answers a series of questions on behalf of the customer. Each correct answer increases a confidence score; each wrong answer decreases it. Once the confidence reaches 75%, a JWT is issued.

### Verification Questions

There are 8 possible questions. The system selects from these based on available customer data:

| ID                   | Question Text                                         | Weight   | Notes                                          |
|----------------------|-------------------------------------------------------|----------|-------------------------------------------------|
| `full_name`          | What is the customer's full name?                     | +10%     | Easy — first + last name                        |
| `date_of_birth`      | What is the customer's date of birth?                 | +15%     | Accept YYYY-MM-DD or MM/DD/YYYY                 |
| `phone_number`       | What is the customer's registered phone number?       | +15%     | **Skipped** if phone was used to start session   |
| `email`              | What is the customer's registered email address?      | +15%     | Case-insensitive match                           |
| `address`            | What is the customer's address or ZIP code?           | +15%     | Fuzzy match — ZIP alone is sufficient            |
| `account_number`     | What is one of the customer's account numbers?        | +25%     | Match any account owned by the customer          |
| `card_last_four`     | What are the last 4 digits of the customer's card?    | +25%     | **Skipped** if customer has no cards             |
| `last_txn_amount`    | What was the amount of the customer's last transaction? | +30%   | Accept exact cents or dollar format ($50.00 = 5000) |

### Confidence Scoring

- **Initial confidence**: `0.0`
- **Correct answer**: `confidence += weight`
- **Wrong answer**: `confidence -= (weight / 2)` (half the weight is subtracted)
- **Minimum confidence**: `0.0` (cannot go below zero)
- **Threshold**: `0.75` (75%)

### Question Selection Order

1. Filter out questions that don't apply (phone if used to start, card if none exist).
2. Sort remaining questions by weight descending (highest weight first).
3. Apply a slight randomization: shuffle questions within the same weight tier.
4. Questions are asked one at a time. Each question is asked only once.

### Answer Matching Rules

| Question           | Matching Logic                                                        |
|--------------------|-----------------------------------------------------------------------|
| `full_name`        | Case-insensitive. Must match `firstName + " " + lastName`.           |
| `date_of_birth`    | Parse and compare dates. Accept `YYYY-MM-DD`, `MM/DD/YYYY`, `DD/MM/YYYY`. |
| `phone_number`     | Strip non-digit characters, compare last 10 digits.                   |
| `email`            | Case-insensitive exact match.                                         |
| `address`          | Fuzzy: if answer contains the customer's ZIP code, it's correct. Otherwise, case-insensitive substring match against the full address. |
| `account_number`   | Exact match against any of the customer's account numbers.            |
| `card_last_four`   | Exact match against last 4 digits of any of the customer's cards.     |
| `last_txn_amount`  | Compare as cents. Accept `"5000"` (cents) or `"$50.00"` or `"50.00"` (dollars). Match against the most recent completed transaction across all accounts. |

### Session Lifecycle

```
Start (phone number)
  │
  ├─ Customer not found → 404
  │
  └─ Customer found → Create session (IN_PROGRESS, expires in 10 min)
       │
       ├─ Answer correct + confidence >= 75% → VERIFIED → issue JWT
       │
       ├─ Answer (correct/wrong) + more questions → IN_PROGRESS → next question
       │
       ├─ All questions exhausted + confidence < 75% → FAILED
       │
       └─ Session expired → EXPIRED (checked on each answer attempt)
```

### Session Expiry

- Sessions expire 10 minutes after creation.
- On every `/verify/answer` call, check `expiresAt`. If expired, update status to EXPIRED and return error.

---

## 6. Business Rules Summary

### Account Status Rules

| Status   | Can Deposit | Can Withdraw | Can Transfer (from) | Can Transfer (to) | Can Pay | Can View |
|----------|-------------|--------------|----------------------|--------------------|---------|----------|
| ACTIVE   | Yes         | Yes          | Yes                  | Yes                | Yes     | Yes      |
| FROZEN   | No          | No           | No                   | No                 | No      | Yes      |
| CLOSED   | No          | No           | No                   | No                 | No      | Yes      |

### Transfer Rules

- Both accounts must be ACTIVE.
- Both accounts must have the same `currency`.
- Source account must have `balance >= amount`.
- Source and destination must be different accounts.
- Amount must be > 0.
- Atomic: balance changes + transaction records + transfer record in a single DB transaction.

### Payment Rules

- Account must be ACTIVE.
- Account must have `balance >= amount`.
- Created with status PENDING.
- Automatically transitions to COMPLETED after ~5 seconds.
- Balance is deducted immediately on creation (not on completion).

### Card Rules

- Cards are always returned with `maskedNumber` (except on creation).
- CVV is only returned on creation.
- Card number format: 16 digits, Luhn-valid.
- Default daily limit: $5,000 (500000 cents).
- Expiry validation: on any card-dependent operation, parse `expiryDate` (MM/YY) and compare to the current date. If expired, automatically update the card status to EXPIRED and return error `CARD_NOT_ACTIVE` with message "Card has expired".
- Status transitions:
  - ACTIVE ↔ BLOCKED (bidirectional)
  - ACTIVE → CANCELLED
  - BLOCKED → CANCELLED
  - EXPIRED → CANCELLED
  - CANCELLED → (terminal, no transitions out)
  - EXPIRED → (no transitions except to CANCELLED)

### Withdrawal Rules

- Account must be ACTIVE.
- Account must have sufficient balance.
- ATM channel: check that the account has an ACTIVE (non-expired) debit card, then check daily card limit (sum of today's ATM withdrawals). If the card is expired, return `CARD_NOT_ACTIVE`.
- TELLER and ONLINE channels: no card limit check.

### Deposit Rules

- Account must be ACTIVE.
- Amount must be > 0.
- Balance is credited immediately.

---

## 7. Seed Data

The following data is pre-populated when the application starts (via Prisma seed script).

### Customers

| ID        | Email                      | Password (plain) | First Name | Last Name | DOB        | Phone          | Address                          | ZIP   | Status | KYC     |
|-----------|----------------------------|-------------------|------------|-----------|------------|----------------|----------------------------------|-------|--------|---------|
| `cust_01` | john.doe@example.com       | password123       | John       | Doe       | 1985-03-15 | +1234567890    | 123 Main St, New York, NY        | 10001 | ACTIVE | true    |
| `cust_02` | jane.smith@example.com     | password456       | Jane       | Smith     | 1990-07-22 | +1987654321    | 456 Oak Ave, Los Angeles, CA     | 90001 | ACTIVE | true    |
| `cust_03` | bob.wilson@example.com     | password789       | Bob        | Wilson    | 1978-11-03 | +1555123456    | 789 Pine Rd, Chicago, IL         | 60601 | ACTIVE | false   |

### Accounts

| ID       | Customer  | Account Number | Type     | Currency | Balance (cents) | Status |
|----------|-----------|----------------|----------|----------|-----------------|--------|
| `acc_01` | `cust_01` | 1000000001     | CHECKING | USD      | 250000          | ACTIVE |
| `acc_02` | `cust_01` | 1000000002     | SAVINGS  | USD      | 1000000         | ACTIVE |
| `acc_03` | `cust_02` | 2000000001     | CHECKING | USD      | 500000          | ACTIVE |
| `acc_04` | `cust_02` | 2000000002     | SAVINGS  | USD      | 75000           | ACTIVE |
| `acc_05` | `cust_03` | 3000000001     | CHECKING | USD      | 125000          | ACTIVE |
| `acc_06` | `cust_03` | 3000000002     | SAVINGS  | USD      | 0               | FROZEN |

### Cards

| ID        | Account  | Card Number      | Masked               | Expiry | Type  | Status | Daily Limit |
|-----------|----------|------------------|-----------------------|--------|-------|--------|-------------|
| `card_01` | `acc_01` | 4532015112830366 | ****-****-****-0366  | 01/28  | DEBIT | ACTIVE | 500000      |
| `card_02` | `acc_03` | 4916338506082832 | ****-****-****-2832  | 06/28  | DEBIT | ACTIVE | 300000      |
| `card_03` | `acc_01` | 4539578763621486 | ****-****-****-1486  | 03/28  | CREDIT| ACTIVE | 1000000     |

### Transactions (sample — 20+ total across accounts)

| ID       | Account  | Type   | Amount | Balance After | Description                    | Status    | Date                    |
|----------|----------|--------|--------|---------------|--------------------------------|-----------|-------------------------|
| `txn_01` | `acc_01` | CREDIT | 500000 | 500000        | Initial deposit                | COMPLETED | 2025-01-01T09:00:00.000Z |
| `txn_02` | `acc_01` | DEBIT  | 50000  | 450000        | Grocery store                  | COMPLETED | 2025-01-02T14:30:00.000Z |
| `txn_03` | `acc_01` | DEBIT  | 100000 | 350000        | Transfer to savings            | COMPLETED | 2025-01-03T10:00:00.000Z |
| `txn_04` | `acc_02` | CREDIT | 100000 | 100000        | Transfer from checking         | COMPLETED | 2025-01-03T10:00:00.000Z |
| `txn_05` | `acc_01` | CREDIT | 350000 | 700000        | Salary deposit                 | COMPLETED | 2025-01-05T09:00:00.000Z |
| `txn_06` | `acc_01` | DEBIT  | 25000  | 675000        | Electric bill                  | COMPLETED | 2025-01-06T11:00:00.000Z |
| `txn_07` | `acc_01` | DEBIT  | 15000  | 660000        | Internet bill                  | COMPLETED | 2025-01-07T16:00:00.000Z |
| `txn_08` | `acc_01` | DEBIT  | 200000 | 460000        | Rent payment                   | COMPLETED | 2025-01-08T08:00:00.000Z |
| `txn_09` | `acc_01` | DEBIT  | 8500   | 451500        | Coffee shop                    | COMPLETED | 2025-01-09T07:30:00.000Z |
| `txn_10` | `acc_01` | DEBIT  | 45000  | 406500        | Gas station                    | COMPLETED | 2025-01-10T18:00:00.000Z |
| `txn_11` | `acc_02` | CREDIT | 500000 | 600000        | Bonus deposit                  | COMPLETED | 2025-01-10T09:00:00.000Z |
| `txn_12` | `acc_02` | CREDIT | 400000 | 1000000       | Investment return              | COMPLETED | 2025-01-12T10:00:00.000Z |
| `txn_13` | `acc_03` | CREDIT | 800000 | 800000        | Initial deposit                | COMPLETED | 2025-01-01T09:00:00.000Z |
| `txn_14` | `acc_03` | DEBIT  | 120000 | 680000        | Online shopping                | COMPLETED | 2025-01-04T13:00:00.000Z |
| `txn_15` | `acc_03` | DEBIT  | 35000  | 645000        | Restaurant                     | COMPLETED | 2025-01-06T19:30:00.000Z |
| `txn_16` | `acc_03` | CREDIT | 450000 | 1095000       | Salary deposit                 | COMPLETED | 2025-01-10T09:00:00.000Z |
| `txn_17` | `acc_03` | DEBIT  | 95000  | 1000000       | Insurance payment              | COMPLETED | 2025-01-11T10:00:00.000Z |
| `txn_18` | `acc_03` | DEBIT  | 500000 | 500000        | Transfer to savings            | COMPLETED | 2025-01-12T10:00:00.000Z |
| `txn_19` | `acc_04` | CREDIT | 500000 | 500000        | Transfer from checking         | COMPLETED | 2025-01-12T10:00:00.000Z |
| `txn_20` | `acc_04` | DEBIT  | 425000 | 75000         | Investment purchase            | COMPLETED | 2025-01-13T14:00:00.000Z |
| `txn_21` | `acc_05` | CREDIT | 300000 | 300000        | Initial deposit                | COMPLETED | 2025-01-01T09:00:00.000Z |
| `txn_22` | `acc_05` | DEBIT  | 75000  | 225000        | Utilities                      | COMPLETED | 2025-01-05T11:00:00.000Z |
| `txn_23` | `acc_05` | DEBIT  | 100000 | 125000        | Rent                           | COMPLETED | 2025-01-08T08:00:00.000Z |
| `txn_24` | `acc_01` | DEBIT  | 156500 | 250000        | Monthly subscription services  | COMPLETED | 2025-01-14T12:00:00.000Z |

### Transfers (sample)

| ID       | From     | To       | Amount | Description          | Status    |
|----------|----------|----------|--------|----------------------|-----------|
| `trf_01` | `acc_01` | `acc_02` | 100000 | Transfer to savings  | COMPLETED |
| `trf_02` | `acc_03` | `acc_04` | 500000 | Transfer to savings  | COMPLETED |

### Payments (sample)

| ID       | Account  | Amount | Beneficiary         | Bank           | Status    |
|----------|----------|--------|---------------------|----------------|-----------|
| `pmt_01` | `acc_01` | 25000  | Electric Company    | National Bank  | COMPLETED |
| `pmt_02` | `acc_01` | 15000  | Internet Provider   | City Bank      | COMPLETED |
| `pmt_03` | `acc_03` | 95000  | Insurance Co.       | State Bank     | COMPLETED |

### Verification Test Scenarios

These customers can be verified using the following answers:

**Customer: John Doe (`+1234567890`)**
- Full name: `John Doe`
- Date of birth: `1985-03-15`
- Email: `john.doe@example.com`
- Address / ZIP: `10001` or `123 Main St`
- Account number: `1000000001` or `1000000002`
- Card last 4: `0366` or `1486`
- Last transaction amount: `156500` (or `$1,565.00`)

**Customer: Jane Smith (`+1987654321`)**
- Full name: `Jane Smith`
- Date of birth: `1990-07-22`
- Email: `jane.smith@example.com`
- Address / ZIP: `90001` or `456 Oak Ave`
- Account number: `2000000001` or `2000000002`
- Card last 4: `2832`
- Last transaction amount: `425000` (or `$4,250.00`)

**Customer: Bob Wilson (`+1555123456`)**
- Full name: `Bob Wilson`
- Date of birth: `1978-11-03`
- Email: `bob.wilson@example.com`
- Address / ZIP: `60601` or `789 Pine Rd`
- Account number: `3000000001` or `3000000002`
- Card last 4: (no cards — question skipped)
- Last transaction amount: `100000` (or `$1,000.00`)

---

## 8. Project Structure

```
bank-api/
├── prisma/
│   ├── schema.prisma          # Database schema (section 3)
│   ├── seed.ts                # Seed data script (section 7)
│   └── migrations/            # Auto-generated migrations
├── src/
│   ├── index.ts               # App entry point, Hono app setup
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── auth.ts            # JWT sign/verify helpers
│   │   ├── errors.ts          # Error classes and handler
│   │   ├── idempotency.ts     # Idempotency middleware
│   │   └── pagination.ts      # Pagination helper
│   ├── middleware/
│   │   └── auth.ts            # Auth middleware (verify JWT, attach customer to context)
│   ├── routes/
│   │   ├── auth.ts            # POST /auth/login, /auth/refresh, /auth/logout
│   │   ├── verify.ts          # POST /auth/verify/start, /auth/verify/answer
│   │   ├── customers.ts       # CRUD /customers
│   │   ├── accounts.ts        # /accounts endpoints
│   │   ├── transactions.ts    # /accounts/:id/transactions, /transactions/:id
│   │   ├── transfers.ts       # /transfers endpoints
│   │   ├── payments.ts        # /payments endpoints
│   │   ├── cards.ts           # /cards endpoints
│   │   ├── deposits.ts        # /deposits endpoints
│   │   └── withdrawals.ts     # /withdrawals endpoints
│   └── services/
│       ├── auth.service.ts          # Login, token management
│       ├── verification.service.ts  # Identity verification logic
│       ├── customer.service.ts      # Customer CRUD
│       ├── account.service.ts       # Account operations
│       ├── transaction.service.ts   # Transaction queries
│       ├── transfer.service.ts      # Transfer logic + atomic DB operations
│       ├── payment.service.ts       # Payment creation + async completion
│       ├── card.service.ts          # Card issuance + management
│       ├── deposit.service.ts       # Deposit logic
│       └── withdrawal.service.ts    # Withdrawal logic + limit checks
├── package.json
├── tsconfig.json
├── .env                       # DATABASE_URL, JWT_SECRET, etc.
├── .env.example               # Template for environment variables
└── SPECIFICATION.md           # This file
```

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/bank_api"
JWT_SECRET="your-secret-key-here"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN="7d"
PORT=3000
```

---

## 9. Development Setup & Deployment

### Prerequisites

- **Node.js** 22+
- **Docker** (for local PostgreSQL)

### Local Development

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Generate Prisma client
npm run db:generate

# 4. Run database migrations
npm run db:migrate

# 5. Seed the database
npm run db:seed

# 6. Start the dev server
npm run dev
```

The server runs at `http://localhost:3000`.

### Database Commands

| Command            | Description                              |
|--------------------|------------------------------------------|
| `npm run db:generate` | Generate Prisma client from schema    |
| `npm run db:migrate`  | Create and apply migrations (dev)     |
| `npm run db:push`     | Push schema changes without migration |
| `npm run db:studio`   | Open Prisma Studio GUI                |
| `npm run db:seed`     | Run seed script                       |

### Production / Coolify Deployment

The project includes a multi-stage `Dockerfile` for production builds. On Coolify (or any Docker-based deployment):

1. Set the required environment variables:
   - `DATABASE_URL` — PostgreSQL connection string
   - `JWT_SECRET` — a strong, unique secret key
   - `JWT_EXPIRES_IN` — access token expiry (default: `15m`)
   - `REFRESH_TOKEN_EXPIRES_IN` — refresh token expiry (default: `7d`)
   - `PORT` — server port (default: `3000`)

2. The container automatically runs `prisma migrate deploy` and `prisma db seed` on startup before starting the Node.js server.

3. Build the production image:
   ```bash
   docker build -t bank-api .
   ```
