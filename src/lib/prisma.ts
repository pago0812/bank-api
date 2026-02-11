import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  pool: {
    max: 15,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
});

const prisma = new PrismaClient({ adapter });

export default prisma;
