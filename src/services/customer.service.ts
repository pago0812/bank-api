import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

const customerSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  phone: true,
  address: true,
  zipCode: true,
  status: true,
  kycVerified: true,
  createdAt: true,
  updatedAt: true,
};

export async function createCustomer(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  address: string;
  zipCode: string;
}) {
  const existingEmail = await prisma.customer.findUnique({ where: { email: data.email } });
  if (existingEmail) {
    throw new AppError(409, 'CONFLICT', 'A customer with this email already exists');
  }

  const existingPhone = await prisma.customer.findUnique({ where: { phone: data.phone } });
  if (existingPhone) {
    throw new AppError(409, 'CONFLICT', 'A customer with this phone number already exists');
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  return prisma.customer.create({
    data: {
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: new Date(data.dateOfBirth),
      phone: data.phone,
      address: data.address,
      zipCode: data.zipCode,
    },
    select: customerSelect,
  });
}

export async function listCustomers(params: {
  page: number;
  limit: number;
  skip: number;
  search?: string;
  status?: string;
  customerId?: string;
}) {
  const where: any = {};

  if (params.customerId) {
    where.id = params.customerId;
  }

  if (params.status) {
    where.status = params.status;
  }

  if (params.search) {
    where.OR = [
      { firstName: { contains: params.search, mode: 'insensitive' } },
      { lastName: { contains: params.search, mode: 'insensitive' } },
      { email: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: customerSelect,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customer.count({ where }),
  ]);

  return { data, total };
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: customerSelect,
  });

  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  }

  return customer;
}

export async function updateCustomer(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string;
    zipCode?: string;
    status?: string;
    kycVerified?: boolean;
  },
) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  }

  if (data.phone && data.phone !== customer.phone) {
    const existing = await prisma.customer.findUnique({ where: { phone: data.phone } });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'A customer with this phone number already exists');
    }
  }

  return prisma.customer.update({
    where: { id },
    data: data as any,
    select: customerSelect,
  });
}

export async function deleteCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { accounts: true },
  });

  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  }

  await prisma.$transaction(async (tx) => {
    // Set all accounts to CLOSED
    await tx.account.updateMany({
      where: { customerId: id },
      data: { status: 'CLOSED' },
    });

    // Set all cards to CANCELLED
    for (const account of customer.accounts) {
      await tx.card.updateMany({
        where: { accountId: account.id },
        data: { status: 'CANCELLED' },
      });
    }

    // Delete refresh tokens
    await tx.refreshToken.deleteMany({ where: { customerId: id } });

    // Soft delete customer
    await tx.customer.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  });

  return { message: 'Customer deleted successfully' };
}
