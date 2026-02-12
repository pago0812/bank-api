import { Hono } from 'hono';
import { botApiTokenMiddleware, botSessionMiddleware } from '../middleware/bot-auth.js';
import * as verificationService from '../services/verification.service.js';
import { signBotSessionToken } from '../lib/auth.js';
import { createAuditLog } from '../services/audit.service.js';
import { AppError } from '../lib/errors.js';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';
import prisma from '../lib/prisma.js';
import type { AppEnv } from '../lib/types.js';

const botRoutes = new Hono<AppEnv>();

// ── Verification routes (API token auth) ──

const verify = new Hono<AppEnv>();
verify.use('*', botApiTokenMiddleware);

verify.post('/start', async (c) => {
  const body = await c.req.json();
  if (!body.phoneNumber) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'phoneNumber', message: 'Phone number is required' },
    ]);
  }

  const result = await verificationService.startVerification(body.phoneNumber);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'BOT_VERIFICATION_STARTED',
    entityType: 'VerificationSession',
    entityId: result.sessionId,
    details: { phoneNumber: body.phoneNumber },
  });

  return c.json(result);
});

verify.post('/answer', async (c) => {
  const body = await c.req.json();
  const missing: { field: string; message: string }[] = [];
  if (!body.sessionId) missing.push({ field: 'sessionId', message: 'Session ID is required' });
  if (!body.questionId) missing.push({ field: 'questionId', message: 'Question ID is required' });
  if (!body.answer) missing.push({ field: 'answer', message: 'Answer is required' });

  if (missing.length > 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', missing);
  }

  const result = await verificationService.answerQuestion(
    body.sessionId,
    body.questionId,
    body.answer,
  );

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'BOT_VERIFICATION_ANSWERED',
    entityType: 'VerificationSession',
    entityId: body.sessionId,
    details: { questionId: body.questionId },
  });

  if (result.status === 'VERIFIED') {
    // Instead of returning the customer access token, return a bot session token
    const botSessionToken = await signBotSessionToken(result.customer!.id, c.get('employeeId'));

    await createAuditLog({
      employeeId: c.get('employeeId'),
      action: 'BOT_VERIFICATION_COMPLETED',
      entityType: 'VerificationSession',
      entityId: body.sessionId,
      details: { confidence: result.confidence, customerId: result.customer!.id },
    });

    return c.json({
      sessionId: result.sessionId,
      status: 'VERIFIED',
      correct: result.correct,
      confidence: result.confidence,
      botSessionToken,
      expiresIn: 900,
      customer: result.customer,
    });
  }

  // For non-verified results, strip the accessToken if present
  const { accessToken, ...rest } = result as any;
  return c.json(rest);
});

botRoutes.route('/verify', verify);

// ── Scoped access routes (bot session JWT auth) ──

const scoped = new Hono<AppEnv>();
scoped.use('*', botSessionMiddleware);

// Customer details
scoped.get('/customer', async (c) => {
  const customerId = c.get('customerId');
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      address: true,
      zipCode: true,
      status: true,
    },
  });

  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  }

  return c.json(customer);
});

// List accounts
scoped.get('/accounts', async (c) => {
  const customerId = c.get('customerId');
  const accounts = await prisma.account.findMany({
    where: { customerId },
    select: {
      id: true,
      accountNumber: true,
      type: true,
      currency: true,
      balance: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json({ data: accounts });
});

// List transactions for an account
scoped.get('/accounts/:id/transactions', async (c) => {
  const customerId = c.get('customerId');
  const accountId = c.req.param('id');

  // Verify account ownership
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.customerId !== customerId) {
    throw new AppError(404, 'NOT_FOUND', 'Account not found');
  }

  const query = c.req.query();
  const pagination = parsePagination(query);

  const where: any = { accountId };
  if (query.type) where.type = query.type;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }

  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transaction.count({ where }),
  ]);

  return c.json(paginatedResponse(data, total, pagination.page, pagination.limit));
});

// List cards
scoped.get('/cards', async (c) => {
  const customerId = c.get('customerId');
  const cards = await prisma.card.findMany({
    where: {
      account: { customerId },
    },
    select: {
      id: true,
      accountId: true,
      maskedNumber: true,
      expiryDate: true,
      type: true,
      status: true,
      dailyLimit: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json({ data: cards });
});

// Block a card
scoped.post('/cards/:id/block', async (c) => {
  const customerId = c.get('customerId');
  const cardId = c.req.param('id');

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { account: true },
  });

  if (!card || card.account.customerId !== customerId) {
    throw new AppError(404, 'NOT_FOUND', 'Card not found');
  }

  if (card.status !== 'ACTIVE') {
    throw new AppError(422, 'VALIDATION_ERROR', `Cannot block a card with status ${card.status}`);
  }

  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { status: 'BLOCKED' },
    select: {
      id: true,
      accountId: true,
      maskedNumber: true,
      expiryDate: true,
      type: true,
      status: true,
      dailyLimit: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'BOT_CARD_BLOCKED',
    entityType: 'Card',
    entityId: cardId,
    details: { customerId, maskedNumber: card.maskedNumber },
  });

  return c.json(updated);
});

botRoutes.route('/', scoped);

export default botRoutes;
