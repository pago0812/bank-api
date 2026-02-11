import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export async function createPayment(data: {
  accountId: string;
  amount: number;
  beneficiaryName: string;
  beneficiaryBank: string;
  beneficiaryAccount: string;
  description?: string;
}) {
  if (data.amount <= 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Amount must be greater than 0');
  }

  const account = await prisma.account.findUnique({ where: { id: data.accountId } });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');

  if (account.status === 'FROZEN') {
    throw new AppError(422, 'ACCOUNT_FROZEN', 'Cannot make payment from a frozen account');
  }
  if (account.status === 'CLOSED') {
    throw new AppError(422, 'ACCOUNT_CLOSED', 'Cannot make payment from a closed account');
  }

  if (account.balance < data.amount) {
    throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient balance for payment', {
      available: account.balance,
      requested: data.amount,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedAccount = await tx.account.update({
      where: { id: data.accountId },
      data: { balance: { decrement: data.amount } },
    });

    const transaction = await tx.transaction.create({
      data: {
        accountId: data.accountId,
        type: 'DEBIT',
        amount: data.amount,
        balanceAfter: updatedAccount.balance,
        description: data.description || `Payment to ${data.beneficiaryName}`,
        status: 'PENDING',
        counterpartyName: data.beneficiaryName,
        counterpartyBank: data.beneficiaryBank,
      },
    });

    const payment = await tx.payment.create({
      data: {
        accountId: data.accountId,
        amount: data.amount,
        beneficiaryName: data.beneficiaryName,
        beneficiaryBank: data.beneficiaryBank,
        beneficiaryAccount: data.beneficiaryAccount,
        description: data.description,
        status: 'PENDING',
      },
    });

    // Auto-complete after 5 seconds
    setTimeout(async () => {
      try {
        await prisma.$transaction(async (tx2) => {
          await tx2.payment.update({
            where: { id: payment.id },
            data: { status: 'COMPLETED' },
          });
          await tx2.transaction.update({
            where: { id: transaction.id },
            data: { status: 'COMPLETED' },
          });
        });
      } catch (err) {
        console.error('Failed to auto-complete payment:', err);
      }
    }, 5000);

    return payment;
  });

  return result;
}

export async function getPayment(id: string) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) {
    throw new AppError(404, 'NOT_FOUND', 'Payment not found');
  }
  return payment;
}

export async function listPayments(params: {
  page: number;
  limit: number;
  skip: number;
  accountId?: string;
  status?: string;
  customerId: string;
}) {
  const where: any = {
    account: { customerId: params.customerId },
  };
  if (params.accountId) where.accountId = params.accountId;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.count({ where }),
  ]);

  return { data, total };
}
