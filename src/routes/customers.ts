import { Hono } from 'hono';
import * as customerService from '../services/customer.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';

const customers = new Hono<AppEnv>();

customers.use('*', authMiddleware);

customers.get('/me', async (c) => {
  const result = await customerService.getCustomer(c.get('customerId'));
  return c.json(result);
});

customers.patch('/me', async (c) => {
  const body = await c.req.json();

  // Customers can only update these fields
  const allowedFields = ['firstName', 'lastName', 'phone', 'address', 'zipCode'];
  const forbiddenFields = Object.keys(body).filter((f) => !allowedFields.includes(f));
  if (forbiddenFields.length > 0) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
  }

  const result = await customerService.updateCustomer(c.get('customerId'), body);
  return c.json(result);
});

export default customers;
