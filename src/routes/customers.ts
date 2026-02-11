import { Hono } from 'hono';
import * as customerService from '../services/customer.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { validate, updateCustomerSchema } from '../lib/validation.js';
import type { AppEnv } from '../lib/types.js';

const customers = new Hono<AppEnv>();

customers.use('*', authMiddleware);

customers.get('/me', async (c) => {
  const result = await customerService.getCustomer(c.get('customerId'));
  return c.json(result);
});

customers.patch('/me', async (c) => {
  const body = validate(updateCustomerSchema, await c.req.json());
  const result = await customerService.updateCustomer(c.get('customerId'), body);
  return c.json(result);
});

export default customers;
