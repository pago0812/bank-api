import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'crypto';
import prisma from '../lib/prisma.js';
import { signEmployeeAccessToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function login(email: string, password: string) {
  const employee = await prisma.employee.findUnique({ where: { email } });
  if (!employee) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  if (!employee.active) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  if (employee.role === 'BOT') {
    throw new AppError(401, 'UNAUTHORIZED', 'BOT employees must use API tokens');
  }

  if (!employee.password) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, employee.password);
  if (!valid) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  const accessToken = await signEmployeeAccessToken(employee.id, employee.role);

  const refreshTokenValue = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await prisma.employeeRefreshToken.create({
    data: {
      employeeId: employee.id,
      token: hashToken(refreshTokenValue),
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken: refreshTokenValue,
    expiresIn: 900,
    employee: {
      id: employee.id,
      employeeId: employee.employeeId,
      email: employee.email,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
    },
  };
}

export async function refresh(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  const record = await prisma.employeeRefreshToken.findUnique({
    where: { token: tokenHash },
    include: { employee: true },
  });

  if (!record) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  if (record.expiresAt < new Date()) {
    await prisma.employeeRefreshToken.delete({ where: { id: record.id } });
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  // Rotate: delete old token and issue a new one
  const newRefreshTokenValue = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.employeeRefreshToken.delete({ where: { id: record.id } }),
    prisma.employeeRefreshToken.create({
      data: {
        employeeId: record.employee.id,
        token: hashToken(newRefreshTokenValue),
        expiresAt,
      },
    }),
  ]);

  const accessToken = await signEmployeeAccessToken(record.employee.id, record.employee.role);
  return {
    accessToken,
    refreshToken: newRefreshTokenValue,
    expiresIn: 900,
  };
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await prisma.employeeRefreshToken.deleteMany({ where: { token: tokenHash } });
  return { message: 'Logged out successfully' };
}
