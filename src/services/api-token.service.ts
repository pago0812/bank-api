import { randomBytes, createHash } from 'crypto';
import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function generateApiToken(employeeId: string, name?: string) {
  const rawSuffix = randomBytes(32).toString('hex');
  const rawToken = `botk_${rawSuffix}`;
  const tokenHash = hashToken(rawToken);
  const prefix = rawToken.slice(0, 13); // "botk_" + 8 chars

  const apiToken = await prisma.apiToken.create({
    data: {
      employeeId,
      token: tokenHash,
      prefix,
      name: name || 'Default',
    },
  });

  return { apiToken, rawToken };
}

export async function validateApiToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const apiToken = await prisma.apiToken.findUnique({
    where: { token: tokenHash },
    include: { employee: true },
  });

  if (!apiToken) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid API token');
  }

  if (!apiToken.active) {
    throw new AppError(401, 'UNAUTHORIZED', 'API token has been revoked');
  }

  if (!apiToken.employee.active) {
    throw new AppError(401, 'UNAUTHORIZED', 'Employee account is inactive');
  }

  // Update lastUsedAt
  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  });

  return apiToken.employee;
}

export async function revokeApiToken(tokenId: string, employeeId: string) {
  const apiToken = await prisma.apiToken.findUnique({ where: { id: tokenId } });

  if (!apiToken || apiToken.employeeId !== employeeId) {
    throw new AppError(404, 'NOT_FOUND', 'API token not found');
  }

  await prisma.apiToken.update({
    where: { id: tokenId },
    data: { active: false },
  });

  return { message: 'API token revoked' };
}

export async function regenerateApiToken(employeeId: string) {
  // Revoke all existing tokens
  await prisma.apiToken.updateMany({
    where: { employeeId, active: true },
    data: { active: false },
  });

  // Generate new token
  return generateApiToken(employeeId);
}
