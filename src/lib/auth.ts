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
      type: 'customer',
      iat: now,
      exp: now + 900, // 15 minutes
    },
    JWT_SECRET,
  );
}

export async function verifyAccessToken(token: string): Promise<{ sub: string }> {
  const payload = await verify(token, JWT_SECRET, 'HS256');
  if (payload.type && payload.type !== 'customer') {
    throw new Error('Invalid token type');
  }
  return payload as { sub: string };
}

export async function signEmployeeAccessToken(employeeId: string, role: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: employeeId,
      type: 'employee',
      role,
      iat: now,
      exp: now + 900, // 15 minutes
    },
    JWT_SECRET,
  );
}

export async function verifyEmployeeAccessToken(token: string): Promise<{ sub: string; role: string }> {
  const payload = await verify(token, JWT_SECRET, 'HS256');
  if (payload.type !== 'employee') {
    throw new Error('Invalid token type');
  }
  return payload as { sub: string; role: string };
}

export async function signBotSessionToken(customerId: string, employeeId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: customerId,
      type: 'bot_session',
      botId: employeeId,
      iat: now,
      exp: now + 900, // 15 minutes
    },
    JWT_SECRET,
  );
}

export async function verifyBotSessionToken(token: string): Promise<{ sub: string; botId: string }> {
  const payload = await verify(token, JWT_SECRET, 'HS256');
  if (payload.type !== 'bot_session') {
    throw new Error('Invalid token type');
  }
  return payload as { sub: string; botId: string };
}
