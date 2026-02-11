import type { Context } from 'hono';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
  }
}

export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(
      {
        status: err.status,
        code: err.code,
        message: err.message,
        details: err.details,
      },
      err.status as any,
    );
  }

  console.error('Unhandled error:', err);
  return c.json(
    {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: null,
    },
    500,
  );
}
