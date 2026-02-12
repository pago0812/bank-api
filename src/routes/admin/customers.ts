import { Hono } from 'hono';
import * as customerService from '../../services/customer.service.js';
import { adminAuthMiddleware, requireRole } from '../../middleware/admin-auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../../lib/idempotency.js';
import { parsePagination, paginatedResponse } from '../../lib/pagination.js';
import { createAuditLog } from '../../services/audit.service.js';
import { validate, createCustomerSchema, adminUpdateCustomerSchema } from '../../lib/validation.js';
import type { AppEnv } from '../../lib/types.js';

const adminCustomers = new Hono<AppEnv>();

adminCustomers.use('*', adminAuthMiddleware);

adminCustomers.post('/', requireRole('TELLER', 'ADMIN'), idempotencyMiddleware, async (c) => {
  const raw = c.get('parsedBody') || (await c.req.json());
  const body = validate(createCustomerSchema, raw);

  const result = await customerService.createCustomer(body);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'CUSTOMER_CREATED',
    entityType: 'Customer',
    entityId: result.id,
    details: { email: body.email, firstName: body.firstName, lastName: body.lastName },
  });

  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

adminCustomers.get('/', async (c) => {
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await customerService.listCustomers({
    page, limit, skip,
    search: query.search,
    status: query.status,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

adminCustomers.get('/:id', async (c) => {
  const result = await customerService.getCustomer(c.req.param('id'));
  return c.json(result);
});

adminCustomers.patch('/:id', requireRole('ADMIN'), async (c) => {
  const body = validate(adminUpdateCustomerSchema, await c.req.json());
  const result = await customerService.updateCustomer(c.req.param('id'), body);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'CUSTOMER_UPDATED',
    entityType: 'Customer',
    entityId: c.req.param('id'),
    details: { fields: Object.keys(body) },
  });

  return c.json(result);
});

adminCustomers.delete('/:id', requireRole('ADMIN'), async (c) => {
  const result = await customerService.deleteCustomer(c.req.param('id'));

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'CUSTOMER_DELETED',
    entityType: 'Customer',
    entityId: c.req.param('id'),
    details: {},
  });

  return c.json(result);
});

export default adminCustomers;
