import prisma from '../lib/prisma.js';

export async function createAuditLog(data: {
  employeeId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      employeeId: data.employeeId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      details: data.details as any,
    },
  });
}

export async function listAuditLogs(params: {
  page: number;
  limit: number;
  skip: number;
  action?: string;
  entityType?: string;
  employeeId?: string;
  from?: string;
  to?: string;
}) {
  const where: any = {};
  if (params.action) where.action = params.action;
  if (params.entityType) where.entityType = params.entityType;
  if (params.employeeId) where.employeeId = params.employeeId;
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = new Date(params.from);
    if (params.to) where.createdAt.lte = new Date(params.to);
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: params.skip,
      take: params.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeId: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { data, total };
}
