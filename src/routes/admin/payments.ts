import { Hono } from 'hono';
import * as paymentService from '../../services/payment.service.js';
import { adminAuthMiddleware } from '../../middleware/admin-auth.js';
import { parsePagination, paginatedResponse } from '../../lib/pagination.js';
import type { AppEnv } from '../../lib/types.js';

const adminPayments = new Hono<AppEnv>();

adminPayments.use('*', adminAuthMiddleware);

adminPayments.get('/', async (c) => {
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await paymentService.listPaymentsAdmin({
    page, limit, skip,
    accountId: query.accountId,
    status: query.status,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

adminPayments.get('/:id', async (c) => {
  const result = await paymentService.getPayment(c.req.param('id'));
  return c.json(result);
});

export default adminPayments;
