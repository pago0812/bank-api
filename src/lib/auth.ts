import { sign, verify } from 'hono/jwt';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set');
}
const JWT_SECRET = process.env.JWT_SECRET;

export async function signAccessToken(customerId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: customerId,
      iat: now,
      exp: now + 900, // 15 minutes
    },
    JWT_SECRET,
  );
}

export async function verifyAccessToken(token: string): Promise<{ sub: string }> {
  const payload = await verify(token, JWT_SECRET, 'HS256');
  return payload as { sub: string };
}
