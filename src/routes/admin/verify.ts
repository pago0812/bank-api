import { Hono } from 'hono';
import * as verificationService from '../../services/verification.service.js';
import { adminAuthMiddleware, requireRole } from '../../middleware/admin-auth.js';
import { createAuditLog } from '../../services/audit.service.js';
import { AppError } from '../../lib/errors.js';
import type { AppEnv } from '../../lib/types.js';

const adminVerify = new Hono<AppEnv>();

adminVerify.use('*', adminAuthMiddleware);
adminVerify.use('*', requireRole('CALL_CENTER_AGENT', 'ADMIN'));

adminVerify.post('/start', async (c) => {
  const body = await c.req.json();
  if (!body.phoneNumber) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'phoneNumber', message: 'Phone number is required' },
    ]);
  }
  const result = await verificationService.startVerification(body.phoneNumber);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'VERIFICATION_STARTED',
    entityType: 'VerificationSession',
    entityId: result.sessionId,
    details: { phoneNumber: body.phoneNumber },
  });

  return c.json(result);
});

adminVerify.post('/answer', async (c) => {
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
    action: 'VERIFICATION_ANSWERED',
    entityType: 'VerificationSession',
    entityId: body.sessionId,
    details: { questionId: body.questionId },
  });

  if (result.status === 'VERIFIED') {
    await createAuditLog({
      employeeId: c.get('employeeId'),
      action: 'VERIFICATION_COMPLETED',
      entityType: 'VerificationSession',
      entityId: body.sessionId,
      details: { confidence: result.confidence },
    });
  }

  return c.json(result);
});

export default adminVerify;
