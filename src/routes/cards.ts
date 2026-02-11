import { Hono } from 'hono';
import * as cardService from '../services/card.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';
import { assertAccountOwnership } from '../lib/authorization.js';
import type { AppEnv } from '../lib/types.js';

const cards = new Hono<AppEnv>();

cards.use('*', authMiddleware);

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

export default cards;
