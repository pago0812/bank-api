import { Hono } from 'hono';
import * as depositService from '../services/deposit.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { assertAccountOwnership } from '../lib/authorization.js';
import type { AppEnv } from '../lib/types.js';

const deposits = new Hono<AppEnv>();

deposits.use('*', authMiddleware);

deposits.get('/:id', async (c) => {
  const result = await depositService.getDeposit(c.req.param('id'));
  await assertAccountOwnership(result.accountId, c.get('customerId'));
  return c.json(result);
});

export default deposits;
