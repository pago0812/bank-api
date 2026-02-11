import { Hono } from 'hono';
import * as adminAuthService from '../../services/admin-auth.service.js';
import { adminAuthMiddleware } from '../../middleware/admin-auth.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { AppError } from '../../lib/errors.js';
import type { AppEnv } from '../../lib/types.js';

const adminAuth = new Hono<AppEnv>();

adminAuth.post('/login', rateLimiter(), async (c) => {
  const body = await c.req.json();
  if (!body.email || !body.password) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      ...(!body.email ? [{ field: 'email', message: 'Email is required' }] : []),
      ...(!body.password ? [{ field: 'password', message: 'Password is required' }] : []),
    ]);
  }
  const result = await adminAuthService.login(body.email, body.password);
  return c.json(result);
});

adminAuth.post('/refresh', rateLimiter(), async (c) => {
  const body = await c.req.json();
  if (!body.refreshToken) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'refreshToken', message: 'Refresh token is required' },
    ]);
  }
  const result = await adminAuthService.refresh(body.refreshToken);
  return c.json(result);
});

adminAuth.post('/logout', adminAuthMiddleware, async (c) => {
  const body = await c.req.json();
  if (!body.refreshToken) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'refreshToken', message: 'Refresh token is required' },
    ]);
  }
  const result = await adminAuthService.logout(body.refreshToken);
  return c.json(result);
});

export default adminAuth;
