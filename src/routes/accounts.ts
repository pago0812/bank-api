import { Hono } from 'hono';
import * as accountService from '../services/account.service.js';
import * as transactionService from '../services/transaction.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../lib/idempotency.js';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';
import { AppError } from '../lib/errors.js';
import { assertCustomerOwnership, assertAccountOwnership } from '../lib/authorization.js';
import type { AppEnv } from '../lib/types.js';

const accounts = new Hono<AppEnv>();

accounts.use('*', authMiddleware);

accounts.post('/', idempotencyMiddleware, async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());

  if (!body.customerId || !body.type) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      ...(!body.customerId ? [{ field: 'customerId', message: 'Customer ID is required' }] : []),
      ...(!body.type ? [{ field: 'type', message: 'Account type is required' }] : []),
    ]);
  }

  // Can only create accounts for yourself
  await assertCustomerOwnership(body.customerId, c.get('customerId'));

  const result = await accountService.createAccount(body);
  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

accounts.get('/', async (c) => {
  const authenticatedId = c.get('customerId');
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  // Always scope to authenticated customer's accounts
  const { data, total } = await accountService.listAccounts({
    page, limit, skip,
    customerId: authenticatedId,
    type: query.type,
    status: query.status,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

accounts.get('/:id', async (c) => {
  await assertAccountOwnership(c.req.param('id'), c.get('customerId'));
  const result = await accountService.getAccount(c.req.param('id'));
  return c.json(result);
});

accounts.get('/:id/balance', async (c) => {
  await assertAccountOwnership(c.req.param('id'), c.get('customerId'));
  const result = await accountService.getBalance(c.req.param('id'));
  return c.json(result);
});

accounts.patch('/:id', async (c) => {
  await assertAccountOwnership(c.req.param('id'), c.get('customerId'));
  const body = await c.req.json();
  if (!body.status) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'status', message: 'Status is required' },
    ]);
  }
  const result = await accountService.updateAccount(c.req.param('id'), body);
  return c.json(result);
});

accounts.get('/:accountId/transactions', async (c) => {
  const accountId = c.req.param('accountId');
  await assertAccountOwnership(accountId, c.get('customerId'));
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await transactionService.listTransactions(accountId, {
    page, limit, skip,
    type: query.type,
    status: query.status,
    from: query.from,
    to: query.to,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

export default accounts;
