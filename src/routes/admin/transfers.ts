import { Hono } from 'hono';
import * as transferService from '../../services/transfer.service.js';
import { adminAuthMiddleware } from '../../middleware/admin-auth.js';
import { parsePagination, paginatedResponse } from '../../lib/pagination.js';
import type { AppEnv } from '../../lib/types.js';

const adminTransfers = new Hono<AppEnv>();

adminTransfers.use('*', adminAuthMiddleware);

adminTransfers.get('/', async (c) => {
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await transferService.listTransfers({
    page, limit, skip,
    fromAccountId: query.fromAccountId,
    toAccountId: query.toAccountId,
    status: query.status,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

adminTransfers.get('/:id', async (c) => {
  const result = await transferService.getTransfer(c.req.param('id'));
  return c.json(result);
});

export default adminTransfers;
