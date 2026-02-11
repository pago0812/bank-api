import prisma from './prisma.js';
import { AppError } from './errors.js';

const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');

export async function assertAccountOwnership(accountId: string, customerId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { customerId: true },
  });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  if (account.customerId !== customerId) throw forbidden();
}

export async function assertCustomerOwnership(resourceCustomerId: string, authenticatedCustomerId: string) {
  if (resourceCustomerId !== authenticatedCustomerId) throw forbidden();
}
