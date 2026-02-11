import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export async function listTransactions(
  accountId: string,
  params: {
    page: number;
    limit: number;
    skip: number;
    type?: string;
    status?: string;
    from?: string;
    to?: string;
  },
) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw new AppError(404, 'NOT_FOUND', 'Account not found');
  }

  const where: any = { accountId };
  if (params.type) where.type = params.type;
  if (params.status) where.status = params.status;
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = new Date(params.from);
    if (params.to) where.createdAt.lte = new Date(params.to);
  }

  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transaction.count({ where }),
  ]);

  return { data, total };
}

export async function getTransaction(id: string) {
  const transaction = await prisma.transaction.findUnique({ where: { id } });
  if (!transaction) {
    throw new AppError(404, 'NOT_FOUND', 'Transaction not found');
  }
  return transaction;
}
