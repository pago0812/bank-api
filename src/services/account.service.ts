import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

function generateAccountNumber(): string {
  let num = '';
  for (let i = 0; i < 10; i++) {
    num += Math.floor(Math.random() * 10).toString();
  }
  return num;
}

export async function createAccount(data: {
  customerId: string;
  type: 'CHECKING' | 'SAVINGS';
  currency?: string;
}) {
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  }
  if (customer.status !== 'ACTIVE') {
    throw new AppError(422, 'VALIDATION_ERROR', 'Customer is not active');
  }

  let accountNumber: string;
  // Ensure unique account number
  do {
    accountNumber = generateAccountNumber();
  } while (await prisma.account.findUnique({ where: { accountNumber } }));

  return prisma.account.create({
    data: {
      customerId: data.customerId,
      accountNumber,
      type: data.type,
      currency: data.currency || 'USD',
    },
  });
}

export async function listAccounts(params: {
  page: number;
  limit: number;
  skip: number;
  customerId?: string;
  type?: string;
  status?: string;
  search?: string;
}) {
  const where: any = {};
  if (params.customerId) where.customerId = params.customerId;
  if (params.type) where.type = params.type;
  if (params.status) where.status = params.status;
  if (params.search) where.accountNumber = { startsWith: params.search };

  const [data, total] = await Promise.all([
    prisma.account.findMany({
      where,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { firstName: true, lastName: true },
        },
      },
    }),
    prisma.account.count({ where }),
  ]);

  return { data, total };
}

export async function getAccount(id: string) {
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) {
    throw new AppError(404, 'NOT_FOUND', 'Account not found');
  }
  return account;
}

export async function getBalance(id: string) {
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) {
    throw new AppError(404, 'NOT_FOUND', 'Account not found');
  }
  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
    balance: account.balance,
    currency: account.currency,
    asOf: account.updatedAt.toISOString(),
  };
}

export async function updateAccount(id: string, data: { status: 'ACTIVE' | 'FROZEN' | 'CLOSED' }) {
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) {
    throw new AppError(404, 'NOT_FOUND', 'Account not found');
  }

  if (account.status === 'CLOSED') {
    throw new AppError(422, 'VALIDATION_ERROR', 'Closed accounts cannot be reopened');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.account.update({
      where: { id },
      data: { status: data.status },
    });

    // When closing, cancel all cards
    if (data.status === 'CLOSED') {
      await tx.card.updateMany({
        where: { accountId: id },
        data: { status: 'CANCELLED' },
      });
    }

    return updated;
  });

  return result;
}
