import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export async function createDeposit(data: {
  accountId: string;
  amount: number;
  source: string;
}) {
  if (data.amount <= 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Amount must be greater than 0');
  }

  const account = await prisma.account.findUnique({ where: { id: data.accountId } });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');

  if (account.status !== 'ACTIVE') {
    if (account.status === 'FROZEN') {
      throw new AppError(422, 'ACCOUNT_FROZEN', 'Cannot deposit to a frozen account');
    }
    throw new AppError(422, 'ACCOUNT_CLOSED', 'Cannot deposit to a closed account');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedAccount = await tx.account.update({
      where: { id: data.accountId },
      data: { balance: { increment: data.amount } },
    });

    await tx.transaction.create({
      data: {
        accountId: data.accountId,
        type: 'CREDIT',
        amount: data.amount,
        balanceAfter: updatedAccount.balance,
        description: `${data.source} deposit`,
        status: 'COMPLETED',
      },
    });

    const deposit = await tx.deposit.create({
      data: {
        accountId: data.accountId,
        amount: data.amount,
        source: data.source,
        status: 'COMPLETED',
      },
    });

    return deposit;
  });

  return result;
}

export async function getDeposit(id: string) {
  const deposit = await prisma.deposit.findUnique({ where: { id } });
  if (!deposit) throw new AppError(404, 'NOT_FOUND', 'Deposit not found');
  return deposit;
}
