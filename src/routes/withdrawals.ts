import { Hono } from 'hono';
import * as withdrawalService from '../services/withdrawal.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { assertAccountOwnership } from '../lib/authorization.js';
import type { AppEnv } from '../lib/types.js';

const withdrawals = new Hono<AppEnv>();

withdrawals.use('*', authMiddleware);

withdrawals.get('/:id', async (c) => {
  const result = await withdrawalService.getWithdrawal(c.req.param('id'));
  await assertAccountOwnership(result.accountId, c.get('customerId'));
  return c.json(result);
});

export default withdrawals;
