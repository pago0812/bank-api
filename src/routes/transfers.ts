import { Hono } from 'hono';
import * as transferService from '../services/transfer.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../lib/idempotency.js';
import { assertAccountOwnership } from '../lib/authorization.js';
import { validate, createTransferSchema } from '../lib/validation.js';
import type { AppEnv } from '../lib/types.js';

const transfers = new Hono<AppEnv>();

transfers.use('*', authMiddleware);

transfers.post('/', idempotencyMiddleware, async (c) => {
  const raw = c.get('parsedBody') || (await c.req.json());
  const body = validate(createTransferSchema, raw);

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
