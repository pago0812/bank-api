import bcrypt from 'bcryptjs';
import prisma from './prisma.js';

export async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) return;

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.customer.create({
    data: {
      email,
      password: hashedPassword,
      firstName: process.env.ADMIN_FIRST_NAME || 'Admin',
      lastName: process.env.ADMIN_LAST_NAME || 'User',
      dateOfBirth: new Date('1990-01-01'),
      phone: process.env.ADMIN_PHONE || '+0000000000',
      address: process.env.ADMIN_ADDRESS || 'N/A',
      zipCode: process.env.ADMIN_ZIP_CODE || '00000',
      status: 'ACTIVE',
      kycVerified: true,
    },
  });

  console.log(`Admin user created: ${email}`);
}
