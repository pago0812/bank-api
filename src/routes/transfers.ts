import { Hono } from 'hono';
import * as transferService from '../services/transfer.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../lib/idempotency.js';
import { AppError } from '../lib/errors.js';
import { assertAccountOwnership } from '../lib/authorization.js';
import type { AppEnv } from '../lib/types.js';

const transfers = new Hono<AppEnv>();

transfers.use('*', authMiddleware);

transfers.post('/', idempotencyMiddleware, async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());

  const missing: { field: string; message: string }[] = [];
  if (!body.fromAccountId) missing.push({ field: 'fromAccountId', message: 'Source account ID is required' });
  if (!body.toAccountId) missing.push({ field: 'toAccountId', message: 'Destination account ID is required' });
  if (body.amount === undefined || body.amount === null) missing.push({ field: 'amount', message: 'Amount is required' });

  if (missing.length > 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', missing);
  }

  // Must own the source account
  await assertAccountOwnership(body.fromAccountId, c.get('customerId'));

  const result = await transferService.createTransfer(body);
  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

transfers.get('/:id', async (c) => {
  const result = await transferService.getTransfer(c.req.param('id'));
  // Must own either the source or destination account
  await assertAccountOwnership(result.fromAccountId, c.get('customerId'))
    .catch(() => assertAccountOwnership(result.toAccountId, c.get('customerId')));
  return c.json(result);
});

export default transfers;
