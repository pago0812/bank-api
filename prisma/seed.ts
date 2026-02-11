import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function hashCardNumber(cardNumber: string): string {
  return createHash('sha256').update(cardNumber).digest('hex');
}

async function main() {
  console.log('Seeding database...');

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.employeeRefreshToken.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.verificationSession.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.card.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.account.deleteMany();
  await prisma.customer.deleteMany();

  // Hash passwords
  const hash1 = await bcrypt.hash('password123', 10);
  const hash2 = await bcrypt.hash('password456', 10);
  const hash3 = await bcrypt.hash('password789', 10);

  // Create customers
  const cust1 = await prisma.customer.create({
    data: {
      id: 'cust_01',
      email: 'john.doe@example.com',
      password: hash1,
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1985-03-15'),
      phone: '+1234567890',
      address: '123 Main St, New York, NY',
      zipCode: '10001',
      status: 'ACTIVE',
      kycVerified: true,
    },
  });

  const cust2 = await prisma.customer.create({
    data: {
      id: 'cust_02',
      email: 'jane.smith@example.com',
      password: hash2,
      firstName: 'Jane',
      lastName: 'Smith',
      dateOfBirth: new Date('1990-07-22'),
      phone: '+1987654321',
      address: '456 Oak Ave, Los Angeles, CA',
      zipCode: '90001',
      status: 'ACTIVE',
      kycVerified: true,
    },
  });

  const cust3 = await prisma.customer.create({
    data: {
      id: 'cust_03',
      email: 'bob.wilson@example.com',
      password: hash3,
      firstName: 'Bob',
      lastName: 'Wilson',
      dateOfBirth: new Date('1978-11-03'),
      phone: '+1555123456',
      address: '789 Pine Rd, Chicago, IL',
      zipCode: '60601',
      status: 'ACTIVE',
      kycVerified: false,
    },
  });

  // Create accounts
  const acc1 = await prisma.account.create({
    data: {
      id: 'acc_01',
      customerId: 'cust_01',
      accountNumber: '1000000001',
      type: 'CHECKING',
      currency: 'USD',
      balance: 250000,
      status: 'ACTIVE',
    },
  });

  const acc2 = await prisma.account.create({
    data: {
      id: 'acc_02',
      customerId: 'cust_01',
      accountNumber: '1000000002',
      type: 'SAVINGS',
      currency: 'USD',
      balance: 1000000,
      status: 'ACTIVE',
    },
  });

  const acc3 = await prisma.account.create({
    data: {
      id: 'acc_03',
      customerId: 'cust_02',
      accountNumber: '2000000001',
      type: 'CHECKING',
      currency: 'USD',
      balance: 500000,
      status: 'ACTIVE',
    },
  });

  const acc4 = await prisma.account.create({
    data: {
      id: 'acc_04',
      customerId: 'cust_02',
      accountNumber: '2000000002',
      type: 'SAVINGS',
      currency: 'USD',
      balance: 75000,
      status: 'ACTIVE',
    },
  });

  const acc5 = await prisma.account.create({
    data: {
      id: 'acc_05',
      customerId: 'cust_03',
      accountNumber: '3000000001',
      type: 'CHECKING',
      currency: 'USD',
      balance: 125000,
      status: 'ACTIVE',
    },
  });

  const acc6 = await prisma.account.create({
    data: {
      id: 'acc_06',
      customerId: 'cust_03',
      accountNumber: '3000000002',
      type: 'SAVINGS',
      currency: 'USD',
      balance: 0,
      status: 'FROZEN',
    },
  });

  // Create cards (card numbers hashed, CVVs hashed)
  const cvvHash1 = await bcrypt.hash('123', 10);
  const cvvHash2 = await bcrypt.hash('456', 10);
  const cvvHash3 = await bcrypt.hash('789', 10);

  await prisma.card.create({
    data: {
      id: 'card_01',
      accountId: 'acc_01',
      cardNumber: hashCardNumber('4532015112830366'),
      maskedNumber: '****-****-****-0366',
      expiryDate: '01/28',
      cvv: cvvHash1,
      type: 'DEBIT',
      status: 'ACTIVE',
      dailyLimit: 500000,
    },
  });

  await prisma.card.create({
    data: {
      id: 'card_02',
      accountId: 'acc_03',
      cardNumber: hashCardNumber('4916338506082832'),
      maskedNumber: '****-****-****-2832',
      expiryDate: '06/28',
      cvv: cvvHash2,
      type: 'DEBIT',
      status: 'ACTIVE',
      dailyLimit: 300000,
    },
  });

  await prisma.card.create({
    data: {
      id: 'card_03',
      accountId: 'acc_01',
      cardNumber: hashCardNumber('4539578763621486'),
      maskedNumber: '****-****-****-1486',
      expiryDate: '03/28',
      cvv: cvvHash3,
      type: 'CREDIT',
      status: 'ACTIVE',
      dailyLimit: 1000000,
    },
  });

  // Create transactions
  const txnData = [
    { id: 'txn_01', accountId: 'acc_01', type: 'CREDIT' as const, amount: 500000, balanceAfter: 500000, description: 'Initial deposit', status: 'COMPLETED' as const, createdAt: new Date('2025-01-01T09:00:00.000Z') },
    { id: 'txn_02', accountId: 'acc_01', type: 'DEBIT' as const, amount: 50000, balanceAfter: 450000, description: 'Grocery store', status: 'COMPLETED' as const, createdAt: new Date('2025-01-02T14:30:00.000Z') },
    { id: 'txn_03', accountId: 'acc_01', type: 'DEBIT' as const, amount: 100000, balanceAfter: 350000, description: 'Transfer to savings', status: 'COMPLETED' as const, createdAt: new Date('2025-01-03T10:00:00.000Z') },
    { id: 'txn_04', accountId: 'acc_02', type: 'CREDIT' as const, amount: 100000, balanceAfter: 100000, description: 'Transfer from checking', status: 'COMPLETED' as const, createdAt: new Date('2025-01-03T10:00:00.000Z') },
    { id: 'txn_05', accountId: 'acc_01', type: 'CREDIT' as const, amount: 350000, balanceAfter: 700000, description: 'Salary deposit', status: 'COMPLETED' as const, createdAt: new Date('2025-01-05T09:00:00.000Z') },
    { id: 'txn_06', accountId: 'acc_01', type: 'DEBIT' as const, amount: 25000, balanceAfter: 675000, description: 'Electric bill', status: 'COMPLETED' as const, createdAt: new Date('2025-01-06T11:00:00.000Z') },
    { id: 'txn_07', accountId: 'acc_01', type: 'DEBIT' as const, amount: 15000, balanceAfter: 660000, description: 'Internet bill', status: 'COMPLETED' as const, createdAt: new Date('2025-01-07T16:00:00.000Z') },
    { id: 'txn_08', accountId: 'acc_01', type: 'DEBIT' as const, amount: 200000, balanceAfter: 460000, description: 'Rent payment', status: 'COMPLETED' as const, createdAt: new Date('2025-01-08T08:00:00.000Z') },
    { id: 'txn_09', accountId: 'acc_01', type: 'DEBIT' as const, amount: 8500, balanceAfter: 451500, description: 'Coffee shop', status: 'COMPLETED' as const, createdAt: new Date('2025-01-09T07:30:00.000Z') },
    { id: 'txn_10', accountId: 'acc_01', type: 'DEBIT' as const, amount: 45000, balanceAfter: 406500, description: 'Gas station', status: 'COMPLETED' as const, createdAt: new Date('2025-01-10T18:00:00.000Z') },
    { id: 'txn_11', accountId: 'acc_02', type: 'CREDIT' as const, amount: 500000, balanceAfter: 600000, description: 'Bonus deposit', status: 'COMPLETED' as const, createdAt: new Date('2025-01-10T09:00:00.000Z') },
    { id: 'txn_12', accountId: 'acc_02', type: 'CREDIT' as const, amount: 400000, balanceAfter: 1000000, description: 'Investment return', status: 'COMPLETED' as const, createdAt: new Date('2025-01-12T10:00:00.000Z') },
    { id: 'txn_13', accountId: 'acc_03', type: 'CREDIT' as const, amount: 800000, balanceAfter: 800000, description: 'Initial deposit', status: 'COMPLETED' as const, createdAt: new Date('2025-01-01T09:00:00.000Z') },
    { id: 'txn_14', accountId: 'acc_03', type: 'DEBIT' as const, amount: 120000, balanceAfter: 680000, description: 'Online shopping', status: 'COMPLETED' as const, createdAt: new Date('2025-01-04T13:00:00.000Z') },
    { id: 'txn_15', accountId: 'acc_03', type: 'DEBIT' as const, amount: 35000, balanceAfter: 645000, description: 'Restaurant', status: 'COMPLETED' as const, createdAt: new Date('2025-01-06T19:30:00.000Z') },
    { id: 'txn_16', accountId: 'acc_03', type: 'CREDIT' as const, amount: 450000, balanceAfter: 1095000, description: 'Salary deposit', status: 'COMPLETED' as const, createdAt: new Date('2025-01-10T09:00:00.000Z') },
    { id: 'txn_17', accountId: 'acc_03', type: 'DEBIT' as const, amount: 95000, balanceAfter: 1000000, description: 'Insurance payment', status: 'COMPLETED' as const, createdAt: new Date('2025-01-11T10:00:00.000Z') },
    { id: 'txn_18', accountId: 'acc_03', type: 'DEBIT' as const, amount: 500000, balanceAfter: 500000, description: 'Transfer to savings', status: 'COMPLETED' as const, createdAt: new Date('2025-01-12T10:00:00.000Z') },
    { id: 'txn_19', accountId: 'acc_04', type: 'CREDIT' as const, amount: 500000, balanceAfter: 500000, description: 'Transfer from checking', status: 'COMPLETED' as const, createdAt: new Date('2025-01-12T10:00:00.000Z') },
    { id: 'txn_20', accountId: 'acc_04', type: 'DEBIT' as const, amount: 425000, balanceAfter: 75000, description: 'Investment purchase', status: 'COMPLETED' as const, createdAt: new Date('2025-01-13T14:00:00.000Z') },
    { id: 'txn_21', accountId: 'acc_05', type: 'CREDIT' as const, amount: 300000, balanceAfter: 300000, description: 'Initial deposit', status: 'COMPLETED' as const, createdAt: new Date('2025-01-01T09:00:00.000Z') },
    { id: 'txn_22', accountId: 'acc_05', type: 'DEBIT' as const, amount: 75000, balanceAfter: 225000, description: 'Utilities', status: 'COMPLETED' as const, createdAt: new Date('2025-01-05T11:00:00.000Z') },
    { id: 'txn_23', accountId: 'acc_05', type: 'DEBIT' as const, amount: 100000, balanceAfter: 125000, description: 'Rent', status: 'COMPLETED' as const, createdAt: new Date('2025-01-08T08:00:00.000Z') },
    { id: 'txn_24', accountId: 'acc_01', type: 'DEBIT' as const, amount: 156500, balanceAfter: 250000, description: 'Monthly subscription services', status: 'COMPLETED' as const, createdAt: new Date('2025-01-14T12:00:00.000Z') },
  ];

  for (const txn of txnData) {
    await prisma.transaction.create({ data: txn });
  }

  // Create transfers
  await prisma.transfer.create({
    data: {
      id: 'trf_01',
      fromAccountId: 'acc_01',
      toAccountId: 'acc_02',
      amount: 100000,
      description: 'Transfer to savings',
      status: 'COMPLETED',
    },
  });

  await prisma.transfer.create({
    data: {
      id: 'trf_02',
      fromAccountId: 'acc_03',
      toAccountId: 'acc_04',
      amount: 500000,
      description: 'Transfer to savings',
      status: 'COMPLETED',
    },
  });

  // Create payments
  await prisma.payment.create({
    data: {
      id: 'pmt_01',
      accountId: 'acc_01',
      amount: 25000,
      beneficiaryName: 'Electric Company',
      beneficiaryBank: 'National Bank',
      beneficiaryAccount: '9876543210',
      description: 'Electric bill',
      status: 'COMPLETED',
    },
  });

  await prisma.payment.create({
    data: {
      id: 'pmt_02',
      accountId: 'acc_01',
      amount: 15000,
      beneficiaryName: 'Internet Provider',
      beneficiaryBank: 'City Bank',
      beneficiaryAccount: '8765432109',
      description: 'Internet bill',
      status: 'COMPLETED',
    },
  });

  await prisma.payment.create({
    data: {
      id: 'pmt_03',
      accountId: 'acc_03',
      amount: 95000,
      beneficiaryName: 'Insurance Co.',
      beneficiaryBank: 'State Bank',
      beneficiaryAccount: '7654321098',
      description: 'Insurance payment',
      status: 'COMPLETED',
    },
  });

  // Create employees
  const empHash1 = await bcrypt.hash('admin123', 10);
  const empHash2 = await bcrypt.hash('manager123', 10);
  const empHash3 = await bcrypt.hash('teller123', 10);
  const empHash4 = await bcrypt.hash('agent123', 10);

  await prisma.employee.create({
    data: {
      id: 'emp_01',
      employeeId: 'EMP-001',
      email: 'admin@bank.com',
      password: empHash1,
      firstName: 'Alice',
      lastName: 'Admin',
      role: 'ADMIN',
      active: true,
    },
  });

  await prisma.employee.create({
    data: {
      id: 'emp_02',
      employeeId: 'EMP-002',
      email: 'manager@bank.com',
      password: empHash2,
      firstName: 'Mark',
      lastName: 'Manager',
      role: 'MANAGER',
      active: true,
    },
  });

  await prisma.employee.create({
    data: {
      id: 'emp_03',
      employeeId: 'EMP-003',
      email: 'teller@bank.com',
      password: empHash3,
      firstName: 'Tom',
      lastName: 'Teller',
      role: 'TELLER',
      active: true,
    },
  });

  await prisma.employee.create({
    data: {
      id: 'emp_04',
      employeeId: 'EMP-004',
      email: 'agent@bank.com',
      password: empHash4,
      firstName: 'Carol',
      lastName: 'Agent',
      role: 'CALL_CENTER_AGENT',
      active: true,
    },
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
