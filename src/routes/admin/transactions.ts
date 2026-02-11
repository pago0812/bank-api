import { Hono } from 'hono';
import * as transactionService from '../../services/transaction.service.js';
import { adminAuthMiddleware } from '../../middleware/admin-auth.js';
import { parsePagination, paginatedResponse } from '../../lib/pagination.js';
import { AppError } from '../../lib/errors.js';
import type { AppEnv } from '../../lib/types.js';

const adminTransactions = new Hono<AppEnv>();

adminTransactions.use('*', adminAuthMiddleware);

adminTransactions.get('/', async (c) => {
  const query = c.req.query();

  if (!query.accountId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'accountId', message: 'Account ID is required' },
    ]);
  }

  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await transactionService.listTransactions(query.accountId, {
    page, limit, skip,
    type: query.type,
    status: query.status,
    from: query.from,
    to: query.to,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

adminTransactions.get('/:id', async (c) => {
  const result = await transactionService.getTransaction(c.req.param('id'));
  return c.json(result);
});

export default adminTransactions;
