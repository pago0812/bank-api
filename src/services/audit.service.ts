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
