import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'crypto';
import prisma from '../lib/prisma.js';
import { signAccessToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function login(email: string, password: string) {
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  if (customer.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, customer.password);
  if (!valid) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  const accessToken = await signAccessToken(customer.id);

  const refreshTokenValue = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await prisma.refreshToken.create({
    data: {
      customerId: customer.id,
      token: hashToken(refreshTokenValue),
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken: refreshTokenValue,
    expiresIn: 900,
    customer: {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
    },
  };
}

export async function refresh(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  const record = await prisma.refreshToken.findUnique({
    where: { token: tokenHash },
  });

  if (!record) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  if (record.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: record.id } });
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  // Rotate: delete old token and issue a new one
  const newRefreshTokenValue = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { id: record.id } }),
    prisma.refreshToken.create({
      data: {
        customerId: record.customerId,
        token: hashToken(newRefreshTokenValue),
        expiresAt,
      },
    }),
  ]);

  const accessToken = await signAccessToken(record.customerId);
  return {
    accessToken,
    refreshToken: newRefreshTokenValue,
    expiresIn: 900,
  };
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.deleteMany({ where: { token: tokenHash } });
  return { message: 'Logged out successfully' };
}
