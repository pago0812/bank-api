import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export async function createWithdrawal(data: {
  accountId: string;
  amount: number;
  channel: string;
}) {
  if (data.amount <= 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Amount must be greater than 0');
  }

  const account = await prisma.account.findUnique({
    where: { id: data.accountId },
    include: { cards: true },
  });

  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');

  if (account.status !== 'ACTIVE') {
    if (account.status === 'FROZEN') {
      throw new AppError(422, 'ACCOUNT_FROZEN', 'Cannot withdraw from a frozen account');
    }
    throw new AppError(422, 'ACCOUNT_CLOSED', 'Cannot withdraw from a closed account');
  }

  if (account.balance < data.amount) {
    throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient balance for withdrawal', {
      requested: data.amount,
    });
  }

  // ATM channel: validate card status before transaction
  let debitCard: typeof account.cards[number] | undefined;
  if (data.channel === 'ATM') {
    debitCard = account.cards.find(
      (c) => c.type === 'DEBIT' && c.status === 'ACTIVE',
    );

    if (!debitCard) {
      // Check if there's an expired debit card
      const expiredDebit = account.cards.find(
        (c) => c.type === 'DEBIT' && (c.status === 'ACTIVE' || c.status === 'BLOCKED'),
      );
      if (expiredDebit) {
        const [month, year] = expiredDebit.expiryDate.split('/').map(Number);
        const expiryEnd = new Date(2000 + year, month, 0);
        if (expiryEnd < new Date()) {
          await prisma.card.update({ where: { id: expiredDebit.id }, data: { status: 'EXPIRED' } });
          throw new AppError(422, 'CARD_NOT_ACTIVE', 'Card has expired');
        }
      }
      throw new AppError(422, 'CARD_NOT_ACTIVE', 'No active debit card found for ATM withdrawal');
    }

    // Check if card is actually expired
    const [month, year] = debitCard.expiryDate.split('/').map(Number);
    const expiryEnd = new Date(2000 + year, month, 0);
    if (expiryEnd < new Date()) {
      await prisma.card.update({ where: { id: debitCard.id }, data: { status: 'EXPIRED' } });
      throw new AppError(422, 'CARD_NOT_ACTIVE', 'Card has expired');
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // ATM daily limit check inside transaction to prevent race conditions
    if (data.channel === 'ATM' && debitCard) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const todayWithdrawals = await tx.withdrawal.aggregate({
        where: {
          accountId: data.accountId,
          channel: 'ATM',
          status: 'COMPLETED',
          createdAt: { gte: todayStart },
        },
        _sum: { amount: true },
      });

      const todayTotal = (todayWithdrawals._sum.amount || 0) + data.amount;
      if (todayTotal > debitCard.dailyLimit) {
        throw new AppError(422, 'DAILY_LIMIT_EXCEEDED', 'Card daily limit would be exceeded');
      }
    }

    const updatedAccount = await tx.account.update({
      where: { id: data.accountId },
      data: { balance: { decrement: data.amount } },
    });

    await tx.transaction.create({
      data: {
        accountId: data.accountId,
        type: 'DEBIT',
        amount: data.amount,
        balanceAfter: updatedAccount.balance,
        description: `${data.channel} withdrawal`,
        status: 'COMPLETED',
      },
    });

    const withdrawal = await tx.withdrawal.create({
      data: {
        accountId: data.accountId,
        amount: data.amount,
        channel: data.channel,
        status: 'COMPLETED',
      },
    });

    return withdrawal;
  });

  return result;
}

export async function getWithdrawal(id: string) {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
  if (!withdrawal) throw new AppError(404, 'NOT_FOUND', 'Withdrawal not found');
  return withdrawal;
}
