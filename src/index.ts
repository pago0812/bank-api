import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { errorHandler } from './lib/errors.js';
import prisma from './lib/prisma.js';
import type { AppEnv } from './lib/types.js';
import { ensureAdminUser } from './lib/admin-seed.js';

import auth from './routes/auth.js';
import verify from './routes/verify.js';
import customers from './routes/customers.js';
import accounts from './routes/accounts.js';
import transactions from './routes/transactions.js';
import transfers from './routes/transfers.js';
import payments from './routes/payments.js';
import cards from './routes/cards.js';
import deposits from './routes/deposits.js';
import withdrawals from './routes/withdrawals.js';

const app = new Hono<AppEnv>();

// Error handler
app.onError(errorHandler);

// Health check
app.get('/', (c) => c.json({ status: 'ok' }));

app.get('/health', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: 'ok', database: 'connected' });
  } catch {
    return c.json({ status: 'error', database: 'disconnected' }, 503);
  }
});

// Mount routes
const api = new Hono<AppEnv>();

api.route('/auth', auth);
api.route('/auth/verify', verify);
api.route('/customers', customers);
api.route('/accounts', accounts);
api.route('/transactions', transactions);
api.route('/transfers', transfers);
api.route('/payments', payments);
api.route('/cards', cards);
api.route('/deposits', deposits);
api.route('/withdrawals', withdrawals);

app.route('/api/v1', api);

const port = parseInt(process.env.PORT || '3000', 10);

const server = serve({
  fetch: app.fetch,
  port,
}, async (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
  await ensureAdminUser();
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
