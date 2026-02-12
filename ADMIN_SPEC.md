# Bank Simulation API — Admin Operations Specification

## 1. Overview

This specification defines the **admin operations** for the bank simulation API. It introduces an employee/bank-worker access model alongside the existing customer access, reflecting how a traditional retail bank operates:

- **Customers** interact via mobile/web app — they can view their data, make transfers, and pay bills.
- **Bank employees** (tellers, admins, call-center agents) perform privileged operations — opening accounts, issuing cards, processing deposits, freezing accounts, and verifying identity.

This document covers the new Employee model, admin authentication, role-based access control, audit logging, and all admin-only endpoints.

### Relationship to Main Specification

This spec **extends** the main `SPECIFICATION.md`. The conventions defined there (error format, pagination, money handling, idempotency, timestamps) apply to admin endpoints as well. Endpoints documented here live under the `/api/v1/admin` prefix.

### Admin Base URL

```
/api/v1/admin
```

---

## 2. Access Model

### 2.1 Roles

| Role                 | Description                                              |
|----------------------|----------------------------------------------------------|
| `ADMIN`              | Full access to all operations. Can manage employees.     |
| `TELLER`             | Can create customers, open accounts, issue cards, process deposits and withdrawals. |
| `CALL_CENTER_AGENT`  | Can verify identity (KBA), view customer data, block/unblock cards. |

### 2.2 Authentication

Admin endpoints use a separate JWT issued via employee login. The token includes the employee's role.

**Employee JWT payload**:

```json
{
  "sub": "emp_01",
  "type": "employee",
  "role": "TELLER",
  "iat": 1705312200,
  "exp": 1705313100
}
```

- **Access token**: JWT, expires in **15 minutes**.
- **Refresh token**: opaque token stored in DB, expires in **7 days**.

Admin endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <employee_access_token>
```

### 2.3 Role-Based Access

Each admin endpoint specifies which roles are allowed. If an employee's role is not in the allowed list, a `403 FORBIDDEN` error is returned:

```json
{
  "status": 403,
  "code": "FORBIDDEN",
  "message": "Insufficient role permissions",
  "details": null
}
```

### 2.4 Audit Logging

Every mutating admin operation creates an `AuditLog` record with:

- The employee who performed the action
- The action type (e.g., `CUSTOMER_CREATED`, `ACCOUNT_FROZEN`)
- The entity affected (type + ID)
- Details of the operation (JSON)
- Timestamp

---

## 3. Data Models (Prisma Schema Additions)

```prisma
enum EmployeeRole {
  TELLER
  ADMIN
  CALL_CENTER_AGENT
}

model Employee {
  id         String       @id @default(uuid())
  employeeId String       @unique // e.g. "EMP-001"
  email      String       @unique
  password   String       // bcrypt hash
  firstName  String
  lastName   String
  role       EmployeeRole
  active     Boolean      @default(true)
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  refreshTokens EmployeeRefreshToken[]
  auditLogs     AuditLog[]
}

model EmployeeRefreshToken {
  id         String   @id @default(uuid())
  employeeId String
  token      String   @unique
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  employee Employee @relation(fields: [employeeId], references: [id])
}

model AuditLog {
  id         String   @id @default(uuid())
  employeeId String
  action     String   // e.g. "CUSTOMER_CREATED", "ACCOUNT_FROZEN"
  entityType String   // e.g. "Customer", "Account", "Card"
  entityId   String
  details    Json     // action-specific details
  createdAt  DateTime @default(now())

  employee Employee @relation(fields: [employeeId], references: [id])

  @@index([employeeId])
  @@index([entityType, entityId])
  @@index([createdAt])
}
```

---

## 4. Changes to Customer-Facing Endpoints

The following endpoints are **removed from customer access** and moved to admin-only:

| Removed Endpoint             | Reason                                      | Admin Replacement                  |
|------------------------------|---------------------------------------------|------------------------------------|
| `POST /api/v1/customers`     | Bank creates customer profiles at a branch  | `POST /api/v1/admin/customers`     |
| `DELETE /api/v1/customers/:id` | Account closure requires bank process     | `DELETE /api/v1/admin/customers/:id` |
| `POST /api/v1/accounts`      | Bank opens accounts, not self-service       | `POST /api/v1/admin/accounts`      |
| `PATCH /api/v1/accounts/:id` | Only bank can freeze/close accounts         | `PATCH /api/v1/admin/accounts/:id` |
| `POST /api/v1/cards`         | Bank issues cards                           | `POST /api/v1/admin/cards`         |
| `PATCH /api/v1/cards/:id`    | Card status changes are admin-only          | `PATCH /api/v1/admin/cards/:id`    |
| `DELETE /api/v1/cards/:id`   | Card cancellation is admin-only             | `DELETE /api/v1/admin/cards/:id`   |
| `POST /api/v1/deposits`      | Only bank can credit accounts               | `POST /api/v1/admin/deposits`      |
| `POST /api/v1/withdrawals`   | Withdrawals are teller operations           | `POST /api/v1/admin/withdrawals`   |
| `POST /api/v1/auth/verify/start` | KBA is a call-center operation          | `POST /api/v1/admin/verify/start`  |
| `POST /api/v1/auth/verify/answer` | KBA is a call-center operation         | `POST /api/v1/admin/verify/answer` |

### Customer Endpoint Modifications

#### `GET /api/v1/customers` → `GET /api/v1/customers/me`

Replaced with a `/me` endpoint. Returns only the authenticated customer's own profile. No pagination, no search.

#### `PATCH /api/v1/customers/:id` → `PATCH /api/v1/customers/me`

Customers can only update their own profile, and only these fields:

| Field       | Type     | Description       |
|-------------|----------|-------------------|
| `firstName` | `string` | First name        |
| `lastName`  | `string` | Last name         |
| `phone`     | `string` | Phone number      |
| `address`   | `string` | Full address      |
| `zipCode`   | `string` | ZIP / postal code |

Attempting to update `status`, `kycVerified`, `email`, or `dateOfBirth` returns `403 FORBIDDEN`.

---

## 5. Admin Endpoints

### 5.1 Admin Auth

#### `POST /api/v1/admin/auth/login`

Authenticate an employee with email and password.

**Auth**: None

**Request Body**:

| Field      | Type     | Required | Description        |
|------------|----------|----------|--------------------|
| `email`    | `string` | Yes      | Employee email     |
| `password` | `string` | Yes      | Employee password  |

**Request Example**:

```json
{
  "email": "admin@bank.com",
  "password": "admin123"
}
```

**Response `200 OK`**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "expiresIn": 900,
  "employee": {
    "id": "emp_01",
    "employeeId": "EMP-001",
    "email": "admin@bank.com",
    "firstName": "Alice",
    "lastName": "Admin",
    "role": "ADMIN"
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
- Employee must have `active = true`. Inactive employees cannot log in.
- Password is compared using bcrypt.
- A new refresh token is created and stored on every login.

---

#### `POST /api/v1/admin/auth/refresh`

Exchange a valid employee refresh token for a new access token.

**Auth**: None

**Request Body**:

| Field          | Type     | Required | Description           |
|----------------|----------|----------|-----------------------|
| `refreshToken` | `string` | Yes      | Employee refresh token |

**Request Example**:

```json
{
  "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
- The refresh token must exist in the `EmployeeRefreshToken` table and not be expired.
- A new access token is issued; the refresh token itself is NOT rotated.
- If the token is expired, it is deleted from the database.

---

#### `POST /api/v1/admin/auth/logout`

Invalidate the current employee refresh token.

**Auth**: Employee Bearer token

**Allowed Roles**: All

**Request Body**:

| Field          | Type     | Required | Description           |
|----------------|----------|----------|-----------------------|
| `refreshToken` | `string` | Yes      | Employee refresh token |

**Request Example**:

```json
{
  "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
- If the refresh token does not exist, still return 200 (idempotent).

---

### 5.2 Identity Verification (KBA)

These endpoints are moved from `/api/v1/auth/verify` to `/api/v1/admin/verify`. The verification flow logic remains the same as described in sections 4.2 and 5 of the main `SPECIFICATION.md`.

#### `POST /api/v1/admin/verify/start`

Start an identity verification session by phone number. Used by call-center agents.

**Auth**: Employee Bearer token

**Allowed Roles**: `CALL_CENTER_AGENT`, `ADMIN`

**Request Body**:

| Field         | Type     | Required | Description                 |
|---------------|----------|----------|-----------------------------|
| `phoneNumber` | `string` | Yes      | Customer's registered phone |

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
- Same as main spec section 4.2 and section 5.
- Creates an `AuditLog` entry with action `VERIFICATION_STARTED`.

---

#### `POST /api/v1/admin/verify/answer`

Submit an answer to the current verification question.

**Auth**: Employee Bearer token

**Allowed Roles**: `CALL_CENTER_AGENT`, `ADMIN`

**Request Body**:

| Field        | Type     | Required | Description                        |
|--------------|----------|----------|------------------------------------|
| `sessionId`  | `string` | Yes      | Verification session ID            |
| `questionId` | `string` | Yes      | ID of the question being answered  |
| `answer`     | `string` | Yes      | The agent's answer                 |

**Request Example**:

```json
{
  "sessionId": "vs_01",
  "questionId": "full_name",
  "answer": "John Doe"
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

**Business Rules**:
- Same as main spec section 4.2 and section 5.
- Creates an `AuditLog` entry with action `VERIFICATION_ANSWERED`.
- On successful verification (VERIFIED), creates an `AuditLog` entry with action `VERIFICATION_COMPLETED`.

---

### 5.3 Customers

#### `POST /api/v1/admin/customers`

Create a new customer.

**Auth**: Employee Bearer token

**Allowed Roles**: `TELLER`, `ADMIN`

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field         | Type     | Required | Description                |
|---------------|----------|----------|----------------------------|
| `email`       | `string` | Yes      | Unique email address       |
| `password`    | `string` | Yes      | Min 8 characters           |
| `firstName`   | `string` | Yes      | First name                 |
| `lastName`    | `string` | Yes      | Last name                  |
| `dateOfBirth` | `string` | Yes      | ISO 8601 date (YYYY-MM-DD) |
| `phone`       | `string` | Yes      | Unique phone number        |
| `address`     | `string` | Yes      | Full address               |
| `zipCode`     | `string` | Yes      | ZIP / postal code          |

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
- Creates an `AuditLog` entry with action `CUSTOMER_CREATED`.

---

#### `GET /api/v1/admin/customers`

List all customers with pagination, search, and filters.

**Auth**: Employee Bearer token

**Allowed Roles**: All

**Query Params**:

| Param    | Type     | Default | Description             |
|----------|----------|---------|-------------------------|
| `page`   | `number` | `1`     | Page number             |
| `limit`  | `number` | `20`    | Items per page (max 100)|
| `search` | `string` | —       | Search by name or email |
| `status` | `string` | —       | Filter by status        |

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

**Business Rules**:
- Unlike the customer-facing endpoint, this returns **all** customers, not scoped to the authenticated user.
- Search performs case-insensitive match against `firstName`, `lastName`, and `email`.

---

#### `GET /api/v1/admin/customers/:id`

Get a single customer by ID.

**Auth**: Employee Bearer token

**Allowed Roles**: All

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Customer ID |

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

#### `PATCH /api/v1/admin/customers/:id`

Update a customer's details. Admins can update all fields including status and KYC.

**Auth**: Employee Bearer token

**Allowed Roles**: `ADMIN`

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Customer ID |

**Request Body** (all fields optional):

| Field         | Type      | Description                  |
|---------------|-----------|------------------------------|
| `firstName`   | `string`  | First name                   |
| `lastName`    | `string`  | Last name                    |
| `phone`       | `string`  | Phone number                 |
| `address`     | `string`  | Full address                 |
| `zipCode`     | `string`  | ZIP / postal code            |
| `status`      | `string`  | `ACTIVE`, `SUSPENDED`, `CLOSED` |
| `kycVerified` | `boolean` | KYC verification status      |

**Request Example**:

```json
{
  "status": "SUSPENDED",
  "kycVerified": false
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
  "address": "123 Main St, New York, NY",
  "zipCode": "10001",
  "status": "SUSPENDED",
  "kycVerified": false,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-15T11:00:00.000Z"
}
```

**Business Rules**:
- Email and dateOfBirth cannot be changed after creation.
- Phone must remain unique if updated.
- Creates an `AuditLog` entry with action `CUSTOMER_UPDATED`.

---

#### `DELETE /api/v1/admin/customers/:id`

Delete a customer. Sets status to CLOSED (soft delete).

**Auth**: Employee Bearer token

**Allowed Roles**: `ADMIN`

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Customer ID |

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
- Creates an `AuditLog` entry with action `CUSTOMER_DELETED`.

---

### 5.4 Accounts

#### `POST /api/v1/admin/accounts`

Create a new account for a customer.

**Auth**: Employee Bearer token

**Allowed Roles**: `TELLER`, `ADMIN`

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field        | Type     | Required | Description                           |
|--------------|----------|----------|---------------------------------------|
| `customerId` | `string` | Yes      | Owner customer ID                     |
| `type`       | `string` | Yes      | `CHECKING` or `SAVINGS`              |
| `currency`   | `string` | No       | ISO 4217 currency code (default: USD) |

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
- Creates an `AuditLog` entry with action `ACCOUNT_CREATED`.

---

#### `GET /api/v1/admin/accounts`

List all accounts with filters and pagination.

**Auth**: Employee Bearer token

**Allowed Roles**: All

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

**Business Rules**:
- Unlike the customer-facing endpoint, this returns accounts across **all** customers.
- Can be filtered by `customerId` to view a specific customer's accounts.

---

#### `GET /api/v1/admin/accounts/:id`

Get account details by ID.

**Auth**: Employee Bearer token

**Allowed Roles**: All

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Account ID  |

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

#### `PATCH /api/v1/admin/accounts/:id`

Update account status.

**Auth**: Employee Bearer token

**Allowed Roles**: `ADMIN`

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Account ID  |

**Request Body**:

| Field    | Type     | Required | Description                      |
|----------|----------|----------|----------------------------------|
| `status` | `string` | Yes      | `ACTIVE`, `FROZEN`, or `CLOSED` |

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
- Creates an `AuditLog` entry with action `ACCOUNT_STATUS_CHANGED`.

---

### 5.5 Cards

#### `POST /api/v1/admin/cards`

Issue a new card for an account.

**Auth**: Employee Bearer token

**Allowed Roles**: `TELLER`, `ADMIN`

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field        | Type     | Required | Description                                              |
|--------------|----------|----------|----------------------------------------------------------|
| `accountId`  | `string` | Yes      | Account ID to link the card to                           |
| `type`       | `string` | Yes      | `DEBIT` or `CREDIT`                                    |
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
- Creates an `AuditLog` entry with action `CARD_ISSUED`.

---

#### `GET /api/v1/admin/cards`

List all cards with pagination.

**Auth**: Employee Bearer token

**Allowed Roles**: All

**Query Params**:

| Param       | Type     | Default | Description                                    |
|-------------|----------|---------|------------------------------------------------|
| `page`      | `number` | `1`     | Page number                                    |
| `limit`     | `number` | `20`    | Items per page (max 100)                       |
| `accountId` | `string` | —       | Filter by account ID                           |
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

**Business Rules**:
- `cardNumber` and `cvv` are **never** included in list responses.
- Unlike the customer-facing endpoint, this returns cards across **all** customers.

---

#### `GET /api/v1/admin/cards/:id`

Get card details by ID.

**Auth**: Employee Bearer token

**Allowed Roles**: All

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

**Business Rules**:
- `cardNumber` and `cvv` are **never** included in get responses.

---

#### `PATCH /api/v1/admin/cards/:id`

Update card status or daily limit.

**Auth**: Employee Bearer token

**Allowed Roles**: `ADMIN`, `CALL_CENTER_AGENT`

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Card ID     |

**Request Body** (at least one field required):

| Field        | Type     | Description                       |
|--------------|----------|-----------------------------------|
| `status`     | `string` | `ACTIVE`, `BLOCKED`              |
| `dailyLimit` | `number` | New daily spending limit in cents |

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
- Creates an `AuditLog` entry with action `CARD_UPDATED`.

---

#### `DELETE /api/v1/admin/cards/:id`

Cancel a card (soft delete).

**Auth**: Employee Bearer token

**Allowed Roles**: `ADMIN`

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
- Creates an `AuditLog` entry with action `CARD_CANCELLED`.

---

### 5.6 Deposits

#### `POST /api/v1/admin/deposits`

Create a deposit into an account. This is the only way to credit money to an account.

**Auth**: Employee Bearer token

**Allowed Roles**: `TELLER`, `ADMIN`

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field       | Type     | Required | Description                |
|-------------|----------|----------|----------------------------|
| `accountId` | `string` | Yes      | Target account ID          |
| `amount`    | `number` | Yes      | Amount in cents            |
| `source`    | `string` | Yes      | `CASH`, `CHECK`, or `WIRE` |

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
- Creates an `AuditLog` entry with action `DEPOSIT_CREATED`.

---

#### `GET /api/v1/admin/deposits/:id`

Get a deposit by ID.

**Auth**: Employee Bearer token

**Allowed Roles**: All

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

### 5.7 Withdrawals

#### `POST /api/v1/admin/withdrawals`

Create a withdrawal from an account.

**Auth**: Employee Bearer token

**Allowed Roles**: `TELLER`

**Request Headers**:

| Header            | Required | Description            |
|-------------------|----------|------------------------|
| `Idempotency-Key` | No       | Unique idempotency key |

**Request Body**:

| Field       | Type     | Required | Description                   |
|-------------|----------|----------|-------------------------------|
| `accountId` | `string` | Yes      | Source account ID             |
| `amount`    | `number` | Yes      | Amount in cents               |
| `channel`   | `string` | Yes      | `ATM`, `TELLER`, or `ONLINE` |

**Request Example**:

```json
{
  "accountId": "acc_01",
  "amount": 20000,
  "channel": "TELLER"
}
```

**Response `201 Created`**:

```json
{
  "id": "wth_01",
  "accountId": "acc_01",
  "amount": 20000,
  "reference": "ref_wth_01",
  "channel": "TELLER",
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
- Creates an `AuditLog` entry with action `WITHDRAWAL_CREATED`.

---

#### `GET /api/v1/admin/withdrawals/:id`

Get a withdrawal by ID.

**Auth**: Employee Bearer token

**Allowed Roles**: All

**Path Params**:

| Param | Type     | Description   |
|-------|----------|---------------|
| `id`  | `string` | Withdrawal ID |

**Response `200 OK`**:

```json
{
  "id": "wth_01",
  "accountId": "acc_01",
  "amount": 20000,
  "reference": "ref_wth_01",
  "channel": "TELLER",
  "status": "COMPLETED",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

---

### 5.8 Transactions (Admin View)

#### `GET /api/v1/admin/transactions`

List all transactions across all accounts with filters and pagination.

**Auth**: Employee Bearer token

**Allowed Roles**: All

**Query Params**:

| Param       | Type     | Default | Description                                    |
|-------------|----------|---------|------------------------------------------------|
| `page`      | `number` | `1`     | Page number                                    |
| `limit`     | `number` | `20`    | Items per page (max 100)                       |
| `accountId` | `string` | —       | Filter by account ID                           |
| `type`      | `string` | —       | Filter by `CREDIT` or `DEBIT`                 |
| `status`    | `string` | —       | Filter by `PENDING`, `COMPLETED`, `FAILED`    |
| `from`      | `string` | —       | Start date (ISO 8601)                          |
| `to`        | `string` | —       | End date (ISO 8601)                            |

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
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

**Business Rules**:
- Transactions are returned in reverse chronological order (newest first).
- The `from` and `to` filters are inclusive.
- No ownership scoping — returns transactions across all accounts.

---

#### `GET /api/v1/admin/transactions/:id`

Get a single transaction by ID.

**Auth**: Employee Bearer token

**Allowed Roles**: All

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

### 5.9 Transfers (Admin View)

#### `GET /api/v1/admin/transfers`

List all transfers with pagination.

**Auth**: Employee Bearer token

**Allowed Roles**: All

**Query Params**:

| Param           | Type     | Default | Description                                   |
|-----------------|----------|---------|-----------------------------------------------|
| `page`          | `number` | `1`     | Page number                                   |
| `limit`         | `number` | `20`    | Items per page (max 100)                      |
| `fromAccountId` | `string` | —       | Filter by source account                      |
| `toAccountId`   | `string` | —       | Filter by destination account                 |
| `status`        | `string` | —       | Filter by `PENDING`, `COMPLETED`, `FAILED`   |

**Response `200 OK`**:

```json
{
  "data": [
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
  ],
  "meta": {
    "total": 2,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

#### `GET /api/v1/admin/transfers/:id`

Get a transfer by ID.

**Auth**: Employee Bearer token

**Allowed Roles**: All

**Path Params**:

| Param | Type     | Description |
|-------|----------|-------------|
| `id`  | `string` | Transfer ID |

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

## 6. Role Permissions Matrix

### Write Operations

| Operation                | TELLER | ADMIN | CALL_CENTER_AGENT |
|--------------------------|--------|-------|--------------------|
| Create customer          | Yes    | Yes   | No                 |
| Update customer          | No     | Yes   | No                 |
| Delete customer          | No     | Yes   | No                 |
| Create account           | Yes    | Yes   | No                 |
| Freeze/close account     | No     | Yes   | No                 |
| Issue card               | Yes    | Yes   | No                 |
| Block/unblock card       | No     | Yes   | Yes                |
| Cancel card              | No     | Yes   | No                 |
| Update card daily limit  | No     | Yes   | Yes                |
| Create deposit           | Yes    | Yes   | No                 |
| Create withdrawal        | Yes    | No    | No                 |
| Start KBA verification   | No     | Yes   | Yes                |
| Answer KBA question      | No     | Yes   | Yes                |

### Read Operations

All employees can read all data (customers, accounts, cards, transactions, transfers, deposits, withdrawals).

---

## 7. Audit Log Actions

| Action                    | Triggered By                            |
|---------------------------|-----------------------------------------|
| `CUSTOMER_CREATED`        | POST /admin/customers                   |
| `CUSTOMER_UPDATED`        | PATCH /admin/customers/:id              |
| `CUSTOMER_DELETED`        | DELETE /admin/customers/:id             |
| `ACCOUNT_CREATED`         | POST /admin/accounts                    |
| `ACCOUNT_STATUS_CHANGED`  | PATCH /admin/accounts/:id               |
| `CARD_ISSUED`             | POST /admin/cards                       |
| `CARD_UPDATED`            | PATCH /admin/cards/:id                  |
| `CARD_CANCELLED`          | DELETE /admin/cards/:id                 |
| `DEPOSIT_CREATED`         | POST /admin/deposits                    |
| `WITHDRAWAL_CREATED`      | POST /admin/withdrawals                 |
| `VERIFICATION_STARTED`    | POST /admin/verify/start                |
| `VERIFICATION_ANSWERED`   | POST /admin/verify/answer               |
| `VERIFICATION_COMPLETED`  | POST /admin/verify/answer (on VERIFIED) |

---

## 8. Seed Data

### Employees

| ID       | Employee ID | Email              | Password (plain) | First Name | Last Name | Role               | Active |
|----------|-------------|--------------------|-------------------|------------|-----------|---------------------|--------|
| `emp_01` | EMP-001     | admin@bank.com     | admin123          | Alice      | Admin     | ADMIN               | true   |
| `emp_02` | EMP-002     | teller@bank.com    | teller123         | Tom        | Teller    | TELLER              | true   |
| `emp_03` | EMP-003     | agent@bank.com     | agent123          | Carol      | Agent     | CALL_CENTER_AGENT   | true   |

---

## 9. Project Structure (Additions)

```
bank-api/
├── src/
│   ├── routes/
│   │   ├── admin/
│   │   │   ├── auth.ts            # POST /admin/auth/login, /refresh, /logout
│   │   │   ├── verify.ts          # POST /admin/verify/start, /verify/answer
│   │   │   ├── customers.ts       # CRUD /admin/customers
│   │   │   ├── accounts.ts        # /admin/accounts endpoints
│   │   │   ├── cards.ts           # /admin/cards endpoints
│   │   │   ├── deposits.ts        # /admin/deposits endpoints
│   │   │   ├── withdrawals.ts     # /admin/withdrawals endpoints
│   │   │   ├── transactions.ts    # /admin/transactions endpoints
│   │   │   └── transfers.ts       # /admin/transfers endpoints
│   │   └── ... (existing customer routes, modified)
│   ├── middleware/
│   │   └── auth.ts                # Add adminAuth middleware
│   └── services/
│       └── audit.service.ts       # NEW: Audit log creation helper
```

### Updated Route Mounting (`src/index.ts`)

```typescript
// Customer routes (existing, modified)
app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/customers', customerRoutes)
app.route('/api/v1/accounts', accountRoutes)
// ... etc

// Admin routes (new)
app.route('/api/v1/admin/auth', adminAuthRoutes)
app.route('/api/v1/admin/verify', adminVerifyRoutes)
app.route('/api/v1/admin/customers', adminCustomerRoutes)
app.route('/api/v1/admin/accounts', adminAccountRoutes)
app.route('/api/v1/admin/cards', adminCardRoutes)
app.route('/api/v1/admin/deposits', adminDepositRoutes)
app.route('/api/v1/admin/withdrawals', adminWithdrawalRoutes)
app.route('/api/v1/admin/transactions', adminTransactionRoutes)
app.route('/api/v1/admin/transfers', adminTransferRoutes)
```
