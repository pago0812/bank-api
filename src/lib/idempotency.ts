import type { Context, Next } from 'hono';
import { createHash } from 'crypto';
import prisma from './prisma.js';
import type { AppEnv } from './types.js';

export async function idempotencyMiddleware(c: Context<AppEnv>, next: Next) {
  const key = c.req.header('Idempotency-Key');
  if (!key) {
    await next();
    return;
  }

  const route = `${c.req.method} ${c.req.path}`;
  const bodyText = await c.req.text();
  const bodyHash = createHash('sha256').update(bodyText).digest('hex');

  // Re-parse body since we consumed it
  if (bodyText) {
    const parsed = JSON.parse(bodyText);
    c.set('parsedBody', parsed);
  }

  const existing = await prisma.idempotencyRecord.findUnique({ where: { key } });

  if (existing) {
    if (existing.route !== route || existing.body !== bodyHash) {
      return c.json(
        {
          status: 409,
          code: 'CONFLICT',
          message: 'Idempotency key already used with a different request',
          details: null,
        },
        409,
      );
    }
    return c.json(existing.response as any, existing.status as any);
  }

  // Store key for later
  c.set('idempotencyKey', key);
  c.set('idempotencyRoute', route);
  c.set('idempotencyBodyHash', bodyHash);

  await next();
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startIdempotencyCleanup() {
  cleanupTimer = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { count } = await prisma.idempotencyRecord.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) {
        console.log(JSON.stringify({ event: 'idempotency_cleanup', deleted: count }));
      }
    } catch (err) {
      console.error('Idempotency cleanup error:', err);
    }
  }, 60 * 60 * 1000); // every hour
  cleanupTimer.unref();
}

export function stopIdempotencyCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export async function saveIdempotencyRecord(
  c: Context<AppEnv>,
  responseBody: unknown,
  status: number,
) {
  const key = c.get('idempotencyKey') as string | undefined;
  if (!key) return;

  const route = c.get('idempotencyRoute') as string;
  const bodyHash = c.get('idempotencyBodyHash') as string;

  await prisma.idempotencyRecord.create({
    data: {
      key,
      route,
      body: bodyHash,
      response: responseBody as any,
      status,
    },
  });
}
