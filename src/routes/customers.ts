import { Hono } from 'hono';
import * as customerService from '../services/customer.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../lib/idempotency.js';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';
import { AppError } from '../lib/errors.js';
import { assertCustomerOwnership } from '../lib/authorization.js';
import type { AppEnv } from '../lib/types.js';

const customers = new Hono<AppEnv>();

customers.use('*', authMiddleware);

customers.post('/', idempotencyMiddleware, async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());

  const required = ['email', 'password', 'firstName', 'lastName', 'dateOfBirth', 'phone', 'address', 'zipCode'];
  const missing = required.filter((f) => !body[f]);
  if (missing.length > 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed',
      missing.map((f) => ({ field: f, message: `${f} is required` })),
    );
  }

  if (body.password && body.password.length < 8) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'password', message: 'Password must be at least 8 characters' },
    ]);
  }

  const result = await customerService.createCustomer(body);
  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

customers.get('/', async (c) => {
  const authenticatedId = c.get('customerId');
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  // Customers can only list themselves
  const { data, total } = await customerService.listCustomers({
    page, limit, skip,
    search: query.search,
    status: query.status,
    customerId: authenticatedId,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

customers.get('/:id', async (c) => {
  await assertCustomerOwnership(c.req.param('id'), c.get('customerId'));
  const result = await customerService.getCustomer(c.req.param('id'));
  return c.json(result);
});

customers.patch('/:id', async (c) => {
  await assertCustomerOwnership(c.req.param('id'), c.get('customerId'));
  const body = await c.req.json();
  const result = await customerService.updateCustomer(c.req.param('id'), body);
  return c.json(result);
});

customers.delete('/:id', async (c) => {
  await assertCustomerOwnership(c.req.param('id'), c.get('customerId'));
  const result = await customerService.deleteCustomer(c.req.param('id'));
  return c.json(result);
});

export default customers;
