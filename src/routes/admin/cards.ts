import { Hono } from 'hono';
import * as cardService from '../../services/card.service.js';
import { adminAuthMiddleware, requireRole } from '../../middleware/admin-auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../../lib/idempotency.js';
import { parsePagination, paginatedResponse } from '../../lib/pagination.js';
import { createAuditLog } from '../../services/audit.service.js';
import { validate, createCardSchema, updateCardSchema } from '../../lib/validation.js';
import type { AppEnv } from '../../lib/types.js';

const adminCards = new Hono<AppEnv>();

adminCards.use('*', adminAuthMiddleware);

adminCards.post('/', requireRole('TELLER', 'ADMIN'), idempotencyMiddleware, async (c) => {
  const raw = c.get('parsedBody') || (await c.req.json());
  const body = validate(createCardSchema, raw);

  const result = await cardService.createCard(body);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'CARD_ISSUED',
    entityType: 'Card',
    entityId: result.id,
    details: { accountId: body.accountId, type: body.type },
  });

  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

adminCards.get('/', async (c) => {
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await cardService.listCardsAdmin({
    page, limit, skip,
    accountId: query.accountId,
    status: query.status,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

adminCards.get('/:id', async (c) => {
  const result = await cardService.getCard(c.req.param('id'));
  return c.json(result);
});

adminCards.patch('/:id', requireRole('ADMIN', 'CALL_CENTER_AGENT'), async (c) => {
  const body = validate(updateCardSchema, await c.req.json());
  const result = await cardService.updateCard(c.req.param('id'), body);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'CARD_UPDATED',
    entityType: 'Card',
    entityId: c.req.param('id'),
    details: { ...body },
  });

  return c.json(result);
});

adminCards.delete('/:id', requireRole('ADMIN'), async (c) => {
  const result = await cardService.deleteCard(c.req.param('id'));

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'CARD_CANCELLED',
    entityType: 'Card',
    entityId: c.req.param('id'),
    details: {},
  });

  return c.json(result);
});

export default adminCards;
