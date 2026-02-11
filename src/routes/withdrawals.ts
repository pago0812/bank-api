import { Hono } from 'hono';
import * as withdrawalService from '../services/withdrawal.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../lib/idempotency.js';
import { AppError } from '../lib/errors.js';
import { assertAccountOwnership } from '../lib/authorization.js';
import type { AppEnv } from '../lib/types.js';

const withdrawals = new Hono<AppEnv>();

withdrawals.use('*', authMiddleware);

withdrawals.post('/', idempotencyMiddleware, async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());

  const missing: { field: string; message: string }[] = [];
  if (!body.accountId) missing.push({ field: 'accountId', message: 'Account ID is required' });
  if (body.amount === undefined || body.amount === null) missing.push({ field: 'amount', message: 'Amount is required' });
  if (!body.channel) missing.push({ field: 'channel', message: 'Channel is required' });

  if (missing.length > 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', missing);
  }

  await assertAccountOwnership(body.accountId, c.get('customerId'));

  const result = await withdrawalService.createWithdrawal(body);
  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

withdrawals.get('/:id', async (c) => {
  const result = await withdrawalService.getWithdrawal(c.req.param('id'));
  await assertAccountOwnership(result.accountId, c.get('customerId'));
  return c.json(result);
});

export default withdrawals;
