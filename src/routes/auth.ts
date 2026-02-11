import { Hono } from 'hono';
import * as authService from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rate-limit.js';
import { validate, loginSchema, refreshTokenSchema } from '../lib/validation.js';
import type { AppEnv } from '../lib/types.js';

const auth = new Hono<AppEnv>();

auth.post('/login', rateLimiter(), async (c) => {
  const body = validate(loginSchema, await c.req.json());
  const result = await authService.login(body.email, body.password);
  return c.json(result);
});

auth.post('/refresh', rateLimiter(), async (c) => {
  const body = validate(refreshTokenSchema, await c.req.json());
  const result = await authService.refresh(body.refreshToken);
  return c.json(result);
});

auth.post('/logout', authMiddleware, async (c) => {
  const body = validate(refreshTokenSchema, await c.req.json());
  const result = await authService.logout(body.refreshToken);
  return c.json(result);
});

export default auth;
