import { Hono } from 'hono';
import * as cardService from '../services/card.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware, saveIdempotencyRecord } from '../lib/idempotency.js';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';
import { AppError } from '../lib/errors.js';
import { assertAccountOwnership } from '../lib/authorization.js';
import type { AppEnv } from '../lib/types.js';

const cards = new Hono<AppEnv>();

cards.use('*', authMiddleware);

cards.post('/', idempotencyMiddleware, async (c) => {
  const body = c.get('parsedBody') || (await c.req.json());

  if (!body.accountId || !body.type) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      ...(!body.accountId ? [{ field: 'accountId', message: 'Account ID is required' }] : []),
      ...(!body.type ? [{ field: 'type', message: 'Card type is required' }] : []),
    ]);
  }

  await assertAccountOwnership(body.accountId, c.get('customerId'));

  const result = await cardService.createCard(body);
  await saveIdempotencyRecord(c, result, 201);
  return c.json(result, 201);
});

cards.get('/', async (c) => {
  const authenticatedId = c.get('customerId');
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await cardService.listCards({
    page, limit, skip,
    accountId: query.accountId,
    status: query.status,
    customerId: authenticatedId,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

cards.get('/:id', async (c) => {
  const result = await cardService.getCard(c.req.param('id'));
  await assertAccountOwnership(result.accountId, c.get('customerId'));
  return c.json(result);
});

cards.patch('/:id', async (c) => {
  const card = await cardService.getCard(c.req.param('id'));
  await assertAccountOwnership(card.accountId, c.get('customerId'));
  const body = await c.req.json();
  if (!body.status && body.dailyLimit === undefined) {
    throw new AppError(422, 'VALIDATION_ERROR', 'At least one field (status or dailyLimit) is required');
  }
  const result = await cardService.updateCard(c.req.param('id'), body);
  return c.json(result);
});

cards.delete('/:id', async (c) => {
  const card = await cardService.getCard(c.req.param('id'));
  await assertAccountOwnership(card.accountId, c.get('customerId'));
  const result = await cardService.deleteCard(c.req.param('id'));
  return c.json(result);
});

export default cards;
