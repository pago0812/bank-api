import { Hono } from 'hono';
import * as accountService from '../../services/account.service.js';
import { adminAuthMiddleware, requireRole } from '../../middleware/admin-auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../../lib/idempotency.js';
import { parsePagination, paginatedResponse } from '../../lib/pagination.js';
import { createAuditLog } from '../../services/audit.service.js';
import { AppError } from '../../lib/errors.js';
import type { AppEnv } from '../../lib/types.js';

const adminAccounts = new Hono<AppEnv>();

adminAccounts.use('*', adminAuthMiddleware);

adminAccounts.post('/', requireRole('TELLER', 'MANAGER', 'ADMIN'), idempotencyMiddleware, async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());

  if (!body.customerId || !body.type) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      ...(!body.customerId ? [{ field: 'customerId', message: 'Customer ID is required' }] : []),
      ...(!body.type ? [{ field: 'type', message: 'Account type is required' }] : []),
    ]);
  }

  const result = await accountService.createAccount(body);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'ACCOUNT_CREATED',
    entityType: 'Account',
    entityId: result.id,
    details: { customerId: body.customerId, type: body.type },
  });

  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

adminAccounts.get('/', async (c) => {
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await accountService.listAccounts({
    page, limit, skip,
    customerId: query.customerId,
    type: query.type,
    status: query.status,
    search: query.search,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

adminAccounts.get('/:id', async (c) => {
  const result = await accountService.getAccount(c.req.param('id'));
  return c.json(result);
});

adminAccounts.patch('/:id', requireRole('MANAGER', 'ADMIN'), async (c) => {
  const body = await c.req.json();
  if (!body.status) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'status', message: 'Status is required' },
    ]);
  }
  const result = await accountService.updateAccount(c.req.param('id'), body);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'ACCOUNT_STATUS_CHANGED',
    entityType: 'Account',
    entityId: c.req.param('id'),
    details: { status: body.status },
  });

  return c.json(result);
});

export default adminAccounts;
