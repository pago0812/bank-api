import { Hono } from 'hono';
import * as verificationService from '../services/verification.service.js';
import { AppError } from '../lib/errors.js';

const verify = new Hono();

verify.post('/start', async (c) => {
  const body = await c.req.json();
  if (!body.phoneNumber) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'phoneNumber', message: 'Phone number is required' },
    ]);
  }
  const result = await verificationService.startVerification(body.phoneNumber);
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
  return c.json(result);
});

export default verify;
