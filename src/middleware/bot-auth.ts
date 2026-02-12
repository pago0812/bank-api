import type { Context, Next } from 'hono';
import { validateApiToken } from '../services/api-token.service.js';
import { verifyBotSessionToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';

export async function botApiTokenMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer botk_')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid API token');
  }

  const rawToken = authHeader.slice(7); // Remove "Bearer "
  const employee = await validateApiToken(rawToken);

  if (employee.role !== 'BOT') {
    throw new AppError(403, 'FORBIDDEN', 'Only BOT employees can use API tokens');
  }

  c.set('employeeId', employee.id);
  c.set('employeeRole', employee.role);

  await next();
}

export async function botSessionMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid token');
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyBotSessionToken(token);
    c.set('customerId', payload.sub);
    c.set('employeeId', payload.botId);
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired bot session token');
  }

  await next();
}
