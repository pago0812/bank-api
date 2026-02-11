import { Hono } from 'hono';
import * as authService from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';

const auth = new Hono<AppEnv>();

auth.post('/login', async (c) => {
  const body = await c.req.json();
  if (!body.email || !body.password) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      ...(!body.email ? [{ field: 'email', message: 'Email is required' }] : []),
      ...(!body.password ? [{ field: 'password', message: 'Password is required' }] : []),
    ]);
  }
  const result = await authService.login(body.email, body.password);
  return c.json(result);
});

auth.post('/refresh', async (c) => {
  const body = await c.req.json();
  if (!body.refreshToken) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'refreshToken', message: 'Refresh token is required' },
    ]);
  }
  const result = await authService.refresh(body.refreshToken);
  return c.json(result);
});

auth.post('/logout', authMiddleware, async (c) => {
  const body = await c.req.json();
  if (!body.refreshToken) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'refreshToken', message: 'Refresh token is required' },
    ]);
  }
  const result = await authService.logout(body.refreshToken);
  return c.json(result);
});

export default auth;
