import { Hono } from 'hono';
import * as transactionService from '../services/transaction.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { assertAccountOwnership } from '../lib/authorization.js';
import type { AppEnv } from '../lib/types.js';

const transactions = new Hono<AppEnv>();

transactions.use('*', authMiddleware);

// GET /accounts/:accountId/transactions - mounted separately in index.ts
// This router handles /transactions/:id only

transactions.get('/:id', async (c) => {
  const result = await transactionService.getTransaction(c.req.param('id'));
  await assertAccountOwnership(result.accountId, c.get('customerId'));
  return c.json(result);
});

export default transactions;
