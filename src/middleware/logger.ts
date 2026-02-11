import type { Context, Next } from 'hono';

export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  console.log(
    JSON.stringify({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    }),
  );
}
