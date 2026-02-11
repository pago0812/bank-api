import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './lib/errors.js';
import prisma from './lib/prisma.js';
import { startIdempotencyCleanup, stopIdempotencyCleanup } from './lib/idempotency.js';
import type { AppEnv } from './lib/types.js';
import { ensureAdminEmployee } from './lib/admin-seed.js';
import { requestLogger } from './middleware/logger.js';
import { securityHeaders } from './middleware/security.js';

import auth from './routes/auth.js';
import customers from './routes/customers.js';
import accounts from './routes/accounts.js';
import transactions from './routes/transactions.js';
import transfers from './routes/transfers.js';
import payments from './routes/payments.js';
import cards from './routes/cards.js';
import deposits from './routes/deposits.js';
import withdrawals from './routes/withdrawals.js';

import adminAuth from './routes/admin/auth.js';
import adminVerify from './routes/admin/verify.js';
import adminCustomers from './routes/admin/customers.js';
import adminAccounts from './routes/admin/accounts.js';
import adminCards from './routes/admin/cards.js';
import adminDeposits from './routes/admin/deposits.js';
import adminWithdrawals from './routes/admin/withdrawals.js';
import adminTransactions from './routes/admin/transactions.js';
import adminTransfers from './routes/admin/transfers.js';
import adminPayments from './routes/admin/payments.js';
import adminAuditLogs from './routes/admin/audit-logs.js';

const app = new Hono<AppEnv>();

// Global middleware
app.use('*', requestLogger);
if (!process.env.CORS_ORIGIN) {
  throw new Error('CORS_ORIGIN environment variable must be set (comma-separated origins)');
}
app.use('*', cors({
  origin: process.env.CORS_ORIGIN.split(','),
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  maxAge: 86400,
  credentials: true,
}));
app.use('*', securityHeaders);

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

// Customer routes
const api = new Hono<AppEnv>();

api.route('/auth', auth);
api.route('/customers', customers);
api.route('/accounts', accounts);
api.route('/transactions', transactions);
api.route('/transfers', transfers);
api.route('/payments', payments);
api.route('/cards', cards);
api.route('/deposits', deposits);
api.route('/withdrawals', withdrawals);

// Admin routes
api.route('/admin/auth', adminAuth);
api.route('/admin/verify', adminVerify);
api.route('/admin/customers', adminCustomers);
api.route('/admin/accounts', adminAccounts);
api.route('/admin/cards', adminCards);
api.route('/admin/deposits', adminDeposits);
api.route('/admin/withdrawals', adminWithdrawals);
api.route('/admin/transactions', adminTransactions);
api.route('/admin/transfers', adminTransfers);
api.route('/admin/payments', adminPayments);
api.route('/admin/audit-logs', adminAuditLogs);

app.route('/api/v1', api);

const port = parseInt(process.env.PORT || '3001', 10);

const server = serve({
  fetch: app.fetch,
  port,
}, async (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
  await ensureAdminEmployee();
  startIdempotencyCleanup();
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);
  stopIdempotencyCleanup();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
