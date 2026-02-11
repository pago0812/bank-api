import { z } from 'zod';
import { AppError } from './errors.js';

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', details);
  }
  return result.data;
}

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().uuid('Invalid refresh token format'),
});

// Customer schemas
export const createCustomerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(100, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name too long'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  phone: z.string().min(1, 'Phone is required').max(20, 'Phone too long'),
  address: z.string().min(1, 'Address is required').max(500, 'Address too long'),
  zipCode: z.string().min(1, 'Zip code is required').max(10, 'Zip code too long'),
});

export const updateCustomerSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().min(1).max(20).optional(),
  address: z.string().min(1).max(500).optional(),
  zipCode: z.string().min(1).max(10).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

export const adminUpdateCustomerSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().min(1).max(20).optional(),
  address: z.string().min(1).max(500).optional(),
  zipCode: z.string().min(1).max(10).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

// Account schemas
export const createAccountSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  type: z.enum(['CHECKING', 'SAVINGS'], { message: 'Type must be CHECKING or SAVINGS' }),
  currency: z.string().length(3).optional(),
});

export const updateAccountSchema = z.object({
  status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED'], { message: 'Status must be ACTIVE, FROZEN, or CLOSED' }),
});

// Transfer schemas
export const createTransferSchema = z.object({
  fromAccountId: z.string().uuid('Invalid source account ID'),
  toAccountId: z.string().uuid('Invalid destination account ID'),
  amount: z.number().int('Amount must be a whole number (cents)').positive('Amount must be greater than 0'),
  description: z.string().max(500).optional(),
});

// Payment schemas
export const createPaymentSchema = z.object({
  accountId: z.string().uuid('Invalid account ID'),
  amount: z.number().int('Amount must be a whole number (cents)').positive('Amount must be greater than 0'),
  beneficiaryName: z.string().min(1, 'Beneficiary name is required').max(200),
  beneficiaryBank: z.string().min(1, 'Beneficiary bank is required').max(200),
  beneficiaryAccount: z.string().min(1, 'Beneficiary account is required').max(50),
  description: z.string().max(500).optional(),
});

// Card schemas
export const createCardSchema = z.object({
  accountId: z.string().uuid('Invalid account ID'),
  type: z.enum(['DEBIT', 'CREDIT'], { message: 'Type must be DEBIT or CREDIT' }),
  dailyLimit: z.number().int().positive('Daily limit must be positive').optional(),
});

export const updateCardSchema = z.object({
  status: z.enum(['ACTIVE', 'BLOCKED']).optional(),
  dailyLimit: z.number().int().positive('Daily limit must be positive').optional(),
}).refine((data) => data.status !== undefined || data.dailyLimit !== undefined, {
  message: 'At least one field (status or dailyLimit) is required',
});

// Deposit schemas
export const createDepositSchema = z.object({
  accountId: z.string().uuid('Invalid account ID'),
  amount: z.number().int('Amount must be a whole number (cents)').positive('Amount must be greater than 0'),
  source: z.enum(['CASH', 'CHECK', 'WIRE'], { message: 'Source must be CASH, CHECK, or WIRE' }),
});

// Withdrawal schemas
export const createWithdrawalSchema = z.object({
  accountId: z.string().uuid('Invalid account ID'),
  amount: z.number().int('Amount must be a whole number (cents)').positive('Amount must be greater than 0'),
  channel: z.enum(['ATM', 'TELLER', 'ONLINE'], { message: 'Channel must be ATM, TELLER, or ONLINE' }),
});
