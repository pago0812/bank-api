import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { generateApiToken } from './api-token.service.js';
import type { EmployeeRole } from '../generated/prisma/client.js';

const employeeSelect = {
  id: true,
  employeeId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
};

export async function createEmployee(data: {
  employeeId: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  role: EmployeeRole;
}) {
  // Check unique constraints
  const existing = await prisma.employee.findFirst({
    where: {
      OR: [{ employeeId: data.employeeId }, { email: data.email }],
    },
  });

  if (existing) {
    if (existing.employeeId === data.employeeId) {
      throw new AppError(409, 'CONFLICT', 'Employee ID already exists');
    }
    throw new AppError(409, 'CONFLICT', 'Email already exists');
  }

  if (data.role === 'BOT') {
    // BOT employees don't have passwords
    const employee = await prisma.employee.create({
      data: {
        employeeId: data.employeeId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
      },
      select: employeeSelect,
    });

    // Auto-generate API token
    const { rawToken, apiToken } = await generateApiToken(employee.id);

    return {
      ...employee,
      rawApiToken: rawToken,
      apiToken: {
        id: apiToken.id,
        prefix: apiToken.prefix,
        name: apiToken.name,
        active: apiToken.active,
        lastUsedAt: apiToken.lastUsedAt,
        createdAt: apiToken.createdAt,
      },
    };
  }

  // Non-BOT employees require a password
  if (!data.password) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Password is required for non-BOT employees');
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const employee = await prisma.employee.create({
    data: {
      employeeId: data.employeeId,
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
    },
    select: employeeSelect,
  });

  return employee;
}

export async function listEmployees(params: {
  page: number;
  limit: number;
  skip: number;
  role?: string;
  active?: string;
  search?: string;
}) {
  const where: any = {};

  if (params.role) {
    where.role = params.role;
  }

  if (params.active !== undefined) {
    where.active = params.active === 'true';
  }

  if (params.search) {
    where.OR = [
      { firstName: { contains: params.search, mode: 'insensitive' } },
      { lastName: { contains: params.search, mode: 'insensitive' } },
      { email: { contains: params.search, mode: 'insensitive' } },
      { employeeId: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: employeeSelect,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.employee.count({ where }),
  ]);

  return { data, total };
}

export async function getEmployee(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      ...employeeSelect,
      apiTokens: {
        select: {
          id: true,
          prefix: true,
          name: true,
          active: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!employee) {
    throw new AppError(404, 'NOT_FOUND', 'Employee not found');
  }

  // Reshape: include API token metadata for BOT employees
  const { apiTokens, ...rest } = employee;
  return {
    ...rest,
    apiToken: employee.role === 'BOT' && apiTokens.length > 0 ? apiTokens[0] : undefined,
  };
}

export async function updateEmployee(
  id: string,
  data: { firstName?: string; lastName?: string; email?: string; active?: boolean },
) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    throw new AppError(404, 'NOT_FOUND', 'Employee not found');
  }

  if (data.email && data.email !== employee.email) {
    const existing = await prisma.employee.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'Email already exists');
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.active !== undefined) updateData.active = data.active;

  return prisma.employee.update({
    where: { id },
    data: updateData,
    select: employeeSelect,
  });
}

export async function deactivateEmployee(id: string) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    throw new AppError(404, 'NOT_FOUND', 'Employee not found');
  }

  await prisma.$transaction([
    // Set inactive
    prisma.employee.update({
      where: { id },
      data: { active: false },
    }),
    // Revoke all API tokens
    prisma.apiToken.updateMany({
      where: { employeeId: id, active: true },
      data: { active: false },
    }),
    // Delete all refresh tokens
    prisma.employeeRefreshToken.deleteMany({
      where: { employeeId: id },
    }),
  ]);

  return { message: 'Employee deactivated' };
}
