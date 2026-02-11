import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

function hashCardNumber(cardNumber: string): string {
  return createHash('sha256').update(cardNumber).digest('hex');
}

function generateLuhnCardNumber(): string {
  // Generate 15 random digits, then compute Luhn check digit
  const digits: number[] = [];
  // Start with 4 (Visa-like)
  digits.push(4);
  for (let i = 1; i < 15; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }

  // Calculate Luhn check digit
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = digits[14 - i];
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  digits.push(checkDigit);

  return digits.join('');
}

function generateCVV(): string {
  return String(Math.floor(100 + Math.random() * 900));
}

function formatMaskedNumber(cardNumber: string): string {
  return `****-****-****-${cardNumber.slice(-4)}`;
}

function formatExpiryDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${year}`;
}

function isCardExpired(expiryDate: string): boolean {
  const [month, year] = expiryDate.split('/').map(Number);
  const expiryEnd = new Date(2000 + year, month, 0); // Last day of expiry month
  return expiryEnd < new Date();
}

const cardSelectPublic = {
  id: true,
  accountId: true,
  maskedNumber: true,
  expiryDate: true,
  type: true,
  status: true,
  dailyLimit: true,
  createdAt: true,
  updatedAt: true,
};

export async function createCard(data: {
  accountId: string;
  type: 'DEBIT' | 'CREDIT';
  dailyLimit?: number;
}) {
  const account = await prisma.account.findUnique({ where: { id: data.accountId } });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  if (account.status !== 'ACTIVE') {
    throw new AppError(422, 'VALIDATION_ERROR', 'Account is not active');
  }

  let cardNumber: string;
  let hashedNumber: string;
  do {
    cardNumber = generateLuhnCardNumber();
    hashedNumber = hashCardNumber(cardNumber);
  } while (await prisma.card.findUnique({ where: { cardNumber: hashedNumber } }));

  const cvv = generateCVV();
  const hashedCvv = await bcrypt.hash(cvv, 10);
  const expiryDate = formatExpiryDate(new Date(Date.now() + 3 * 365.25 * 24 * 60 * 60 * 1000));

  const card = await prisma.card.create({
    data: {
      accountId: data.accountId,
      cardNumber: hashedNumber,
      maskedNumber: formatMaskedNumber(cardNumber),
      expiryDate,
      cvv: hashedCvv,
      type: data.type,
      dailyLimit: data.dailyLimit ?? 500000,
    },
  });

  // Return full card details on creation only (plain text, not hashed)
  return {
    id: card.id,
    accountId: card.accountId,
    cardNumber,
    maskedNumber: card.maskedNumber,
    expiryDate: card.expiryDate,
    cvv,
    type: card.type,
    status: card.status,
    dailyLimit: card.dailyLimit,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

export async function listCards(params: {
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
    prisma.card.findMany({
      where,
      select: cardSelectPublic,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.card.count({ where }),
  ]);

  return { data, total };
}

export async function listCardsAdmin(params: {
  page: number;
  limit: number;
  skip: number;
  accountId?: string;
  status?: string;
}) {
  const where: any = {};
  if (params.accountId) where.accountId = params.accountId;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.card.findMany({
      where,
      select: cardSelectPublic,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.card.count({ where }),
  ]);

  return { data, total };
}

export async function getCard(id: string) {
  const card = await prisma.card.findUnique({
    where: { id },
    select: cardSelectPublic,
  });
  if (!card) throw new AppError(404, 'NOT_FOUND', 'Card not found');
  return card;
}

export async function updateCard(
  id: string,
  data: { status?: 'ACTIVE' | 'BLOCKED'; dailyLimit?: number },
) {
  const card = await prisma.card.findUnique({ where: { id } });
  if (!card) throw new AppError(404, 'NOT_FOUND', 'Card not found');

  // Check expiry
  if (isCardExpired(card.expiryDate) && card.status !== 'EXPIRED' && card.status !== 'CANCELLED') {
    await prisma.card.update({ where: { id }, data: { status: 'EXPIRED' } });
    throw new AppError(422, 'CARD_NOT_ACTIVE', 'Card has expired');
  }

  if (data.status) {
    if (card.status === 'CANCELLED') {
      throw new AppError(422, 'CARD_NOT_ACTIVE', 'Cannot update a cancelled card');
    }
    if (card.status === 'EXPIRED') {
      throw new AppError(422, 'CARD_NOT_ACTIVE', 'Cannot update an expired card');
    }
    // ACTIVE <-> BLOCKED only
    if (card.status === 'ACTIVE' && data.status !== 'BLOCKED') {
      throw new AppError(422, 'VALIDATION_ERROR', 'Active cards can only be blocked');
    }
    if (card.status === 'BLOCKED' && data.status !== 'ACTIVE') {
      throw new AppError(422, 'VALIDATION_ERROR', 'Blocked cards can only be activated');
    }
  }

  if (data.dailyLimit !== undefined && data.dailyLimit <= 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Daily limit must be a positive integer');
  }

  const updateData: Record<string, unknown> = {};
  if (data.status !== undefined) updateData.status = data.status;
  if (data.dailyLimit !== undefined) updateData.dailyLimit = data.dailyLimit;

  return prisma.card.update({
    where: { id },
    data: updateData,
    select: cardSelectPublic,
  });
}

export async function deleteCard(id: string) {
  const card = await prisma.card.findUnique({ where: { id } });
  if (!card) throw new AppError(404, 'NOT_FOUND', 'Card not found');

  if (card.status !== 'CANCELLED') {
    await prisma.card.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  return { message: 'Card cancelled successfully' };
}
