import { Hono } from 'hono';
import * as withdrawalService from '../../services/withdrawal.service.js';
import { adminAuthMiddleware, requireRole } from '../../middleware/admin-auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../../lib/idempotency.js';
import { createAuditLog } from '../../services/audit.service.js';
import { AppError } from '../../lib/errors.js';
import type { AppEnv } from '../../lib/types.js';

const adminWithdrawals = new Hono<AppEnv>();

adminWithdrawals.use('*', adminAuthMiddleware);

adminWithdrawals.post('/', requireRole('TELLER'), idempotencyMiddleware, async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());

  const missing: { field: string; message: string }[] = [];
  if (!body.accountId) missing.push({ field: 'accountId', message: 'Account ID is required' });
  if (body.amount === undefined || body.amount === null) missing.push({ field: 'amount', message: 'Amount is required' });
  if (!body.channel) missing.push({ field: 'channel', message: 'Channel is required' });

  if (missing.length > 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', missing);
  }

  const result = await withdrawalService.createWithdrawal(body);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'WITHDRAWAL_CREATED',
    entityType: 'Withdrawal',
    entityId: result.id,
    details: { accountId: body.accountId, amount: body.amount, channel: body.channel },
  });

  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

adminWithdrawals.get('/:id', async (c) => {
  const result = await withdrawalService.getWithdrawal(c.req.param('id'));
  return c.json(result);
});

export default adminWithdrawals;
