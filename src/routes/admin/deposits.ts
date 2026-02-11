import { Hono } from 'hono';
import * as depositService from '../../services/deposit.service.js';
import { adminAuthMiddleware, requireRole } from '../../middleware/admin-auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../../lib/idempotency.js';
import { createAuditLog } from '../../services/audit.service.js';
import { AppError } from '../../lib/errors.js';
import type { AppEnv } from '../../lib/types.js';

const adminDeposits = new Hono<AppEnv>();

adminDeposits.use('*', adminAuthMiddleware);

adminDeposits.post('/', requireRole('TELLER', 'MANAGER', 'ADMIN'), idempotencyMiddleware, async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());

  const missing: { field: string; message: string }[] = [];
  if (!body.accountId) missing.push({ field: 'accountId', message: 'Account ID is required' });
  if (body.amount === undefined || body.amount === null) missing.push({ field: 'amount', message: 'Amount is required' });
  if (!body.source) missing.push({ field: 'source', message: 'Source is required' });

  if (missing.length > 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', missing);
  }

  const result = await depositService.createDeposit(body);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'DEPOSIT_CREATED',
    entityType: 'Deposit',
    entityId: result.id,
    details: { accountId: body.accountId, amount: body.amount, source: body.source },
  });

  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

adminDeposits.get('/:id', async (c) => {
  const result = await depositService.getDeposit(c.req.param('id'));
  return c.json(result);
});

export default adminDeposits;
