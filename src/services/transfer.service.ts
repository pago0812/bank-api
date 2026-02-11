import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export async function createTransfer(data: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description?: string;
}) {
  if (data.amount <= 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Amount must be greater than 0');
  }

  if (data.fromAccountId === data.toAccountId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Source and destination must be different accounts');
  }

  const [fromAccount, toAccount] = await Promise.all([
    prisma.account.findUnique({ where: { id: data.fromAccountId } }),
    prisma.account.findUnique({ where: { id: data.toAccountId } }),
  ]);

  if (!fromAccount) throw new AppError(404, 'NOT_FOUND', 'Source account not found');
  if (!toAccount) throw new AppError(404, 'NOT_FOUND', 'Destination account not found');

  if (fromAccount.status === 'FROZEN') {
    throw new AppError(422, 'ACCOUNT_FROZEN', 'Cannot transfer from a frozen account');
  }
  if (fromAccount.status === 'CLOSED') {
    throw new AppError(422, 'ACCOUNT_CLOSED', 'Cannot transfer from a closed account');
  }
  if (toAccount.status === 'FROZEN') {
    throw new AppError(422, 'ACCOUNT_FROZEN', 'Cannot transfer to a frozen account');
  }
  if (toAccount.status === 'CLOSED') {
    throw new AppError(422, 'ACCOUNT_CLOSED', 'Cannot transfer to a closed account');
  }

  if (fromAccount.currency !== toAccount.currency) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Both accounts must have the same currency');
  }

  if (fromAccount.balance < data.amount) {
    throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient balance in source account', {
      requested: data.amount,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedFrom = await tx.account.update({
      where: { id: data.fromAccountId },
      data: { balance: { decrement: data.amount } },
    });

    const updatedTo = await tx.account.update({
      where: { id: data.toAccountId },
      data: { balance: { increment: data.amount } },
    });

    const description = data.description || 'Transfer';

    await tx.transaction.create({
      data: {
        accountId: data.fromAccountId,
        type: 'DEBIT',
        amount: data.amount,
        balanceAfter: updatedFrom.balance,
        description,
        status: 'COMPLETED',
      },
    });

    await tx.transaction.create({
      data: {
        accountId: data.toAccountId,
        type: 'CREDIT',
        amount: data.amount,
        balanceAfter: updatedTo.balance,
        description,
        status: 'COMPLETED',
      },
    });

    const transfer = await tx.transfer.create({
      data: {
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amount: data.amount,
        description: data.description,
        status: 'COMPLETED',
      },
    });

    return transfer;
  });

  return result;
}

export async function getTransfer(id: string) {
  const transfer = await prisma.transfer.findUnique({ where: { id } });
  if (!transfer) {
    throw new AppError(404, 'NOT_FOUND', 'Transfer not found');
  }
  return transfer;
}

export async function listTransfers(params: {
  page: number;
  limit: number;
  skip: number;
  fromAccountId?: string;
  toAccountId?: string;
  status?: string;
}) {
  const where: any = {};
  if (params.fromAccountId) where.fromAccountId = params.fromAccountId;
  if (params.toAccountId) where.toAccountId = params.toAccountId;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.transfer.findMany({
      where,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transfer.count({ where }),
  ]);

  return { data, total };
}
