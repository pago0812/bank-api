import { Hono } from 'hono';
import * as paymentService from '../services/payment.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../lib/idempotency.js';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';
import { assertAccountOwnership } from '../lib/authorization.js';
import { validate, createPaymentSchema } from '../lib/validation.js';
import type { AppEnv } from '../lib/types.js';

const payments = new Hono<AppEnv>();

payments.use('*', authMiddleware);

payments.post('/', idempotencyMiddleware, async (c) => {
  const raw = c.get('parsedBody') || (await c.req.json());
  const body = validate(createPaymentSchema, raw);

  await assertAccountOwnership(body.accountId, c.get('customerId'));

  const result = await paymentService.createPayment(body);
  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

payments.get('/:id', async (c) => {
  const result = await paymentService.getPayment(c.req.param('id'));
  await assertAccountOwnership(result.accountId, c.get('customerId'));
  return c.json(result);
});

payments.get('/', async (c) => {
  const authenticatedId = c.get('customerId');
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await paymentService.listPayments({
    page, limit, skip,
    accountId: query.accountId,
    status: query.status,
    customerId: authenticatedId,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

export default payments;
