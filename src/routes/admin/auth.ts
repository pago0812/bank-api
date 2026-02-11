import { Hono } from 'hono';
import * as adminAuthService from '../../services/admin-auth.service.js';
import { adminAuthMiddleware } from '../../middleware/admin-auth.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { validate, loginSchema, refreshTokenSchema } from '../../lib/validation.js';
import type { AppEnv } from '../../lib/types.js';

const adminAuth = new Hono<AppEnv>();

adminAuth.post('/login', rateLimiter(), async (c) => {
  const body = validate(loginSchema, await c.req.json());
  const result = await adminAuthService.login(body.email, body.password);
  return c.json(result);
});

adminAuth.post('/refresh', rateLimiter(), async (c) => {
  const body = validate(refreshTokenSchema, await c.req.json());
  const result = await adminAuthService.refresh(body.refreshToken);
  return c.json(result);
});

adminAuth.post('/logout', adminAuthMiddleware, async (c) => {
  const body = validate(refreshTokenSchema, await c.req.json());
  const result = await adminAuthService.logout(body.refreshToken);
  return c.json(result);
});

export default adminAuth;
