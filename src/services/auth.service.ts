import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import { signAccessToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';

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
      token: refreshTokenValue,
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
  const record = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!record) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  if (record.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: record.id } });
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  const accessToken = await signAccessToken(record.customerId);
  return { accessToken, expiresIn: 900 };
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  return { message: 'Logged out successfully' };
}
