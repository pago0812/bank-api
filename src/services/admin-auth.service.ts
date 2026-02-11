import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import { signEmployeeAccessToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';

export async function login(email: string, password: string) {
  const employee = await prisma.employee.findUnique({ where: { email } });
  if (!employee) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  if (!employee.active) {
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
      token: refreshTokenValue,
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
  const record = await prisma.employeeRefreshToken.findUnique({
    where: { token: refreshToken },
    include: { employee: true },
  });

  if (!record) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  if (record.expiresAt < new Date()) {
    await prisma.employeeRefreshToken.delete({ where: { id: record.id } });
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  const accessToken = await signEmployeeAccessToken(record.employee.id, record.employee.role);
  return { accessToken, expiresIn: 900 };
}

export async function logout(refreshToken: string) {
  await prisma.employeeRefreshToken.deleteMany({ where: { token: refreshToken } });
  return { message: 'Logged out successfully' };
}
