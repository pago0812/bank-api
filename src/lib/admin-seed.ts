import bcrypt from 'bcryptjs';
import prisma from './prisma.js';

export async function ensureAdminEmployee() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  const existing = await prisma.employee.findUnique({ where: { email } });
  if (existing) return;

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.employee.create({
    data: {
      employeeId: process.env.ADMIN_EMPLOYEE_ID || 'EMP-000',
      email,
      password: hashedPassword,
      firstName: process.env.ADMIN_FIRST_NAME || 'Admin',
      lastName: process.env.ADMIN_LAST_NAME || 'User',
      role: 'ADMIN',
      active: true,
    },
  });

  console.log(`Admin employee created: ${email}`);
}
