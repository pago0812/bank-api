import type { Context, Next, MiddlewareHandler } from 'hono';
import { verifyEmployeeAccessToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';

export async function adminAuthMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid token');
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyEmployeeAccessToken(token);
    c.set('employeeId', payload.sub);
    c.set('employeeRole', payload.role);
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid token');
  }

  await next();
}

export function requireRole(...allowedRoles: string[]): MiddlewareHandler<AppEnv> {
  return async (c: Context<AppEnv>, next: Next) => {
    const role = c.get('employeeRole');
    if (!allowedRoles.includes(role)) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient role permissions');
    }
    await next();
  };
}
