import { Hono } from 'hono';
import * as depositService from '../../services/deposit.service.js';
import { adminAuthMiddleware, requireRole } from '../../middleware/admin-auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../../lib/idempotency.js';
import { createAuditLog } from '../../services/audit.service.js';
import { validate, createDepositSchema } from '../../lib/validation.js';
import type { AppEnv } from '../../lib/types.js';

const adminDeposits = new Hono<AppEnv>();

adminDeposits.use('*', adminAuthMiddleware);

adminDeposits.post('/', requireRole('TELLER', 'ADMIN'), idempotencyMiddleware, async (c) => {
  const raw = c.get('parsedBody') || (await c.req.json());
  const body = validate(createDepositSchema, raw);

  const result = await depositService.createDeposit(body);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'DEPOSIT_CREATED',
    entityType: 'Deposit',
    entityId: result.id,
    details: { accountId: body.accountId, amount: body.amount, source: body.source },
  });

  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

adminDeposits.get('/:id', async (c) => {
  const result = await depositService.getDeposit(c.req.param('id'));
  return c.json(result);
});

export default adminDeposits;
