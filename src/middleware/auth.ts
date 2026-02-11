import type { Context, Next } from 'hono';
import { verifyAccessToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid token');
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    c.set('customerId', payload.sub);
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid token');
  }

  await next();
}
