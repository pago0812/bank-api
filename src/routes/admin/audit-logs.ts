import { Hono } from 'hono';
import { listAuditLogs } from '../../services/audit.service.js';
import { adminAuthMiddleware, requireRole } from '../../middleware/admin-auth.js';
import { parsePagination, paginatedResponse } from '../../lib/pagination.js';
import type { AppEnv } from '../../lib/types.js';

const adminAuditLogs = new Hono<AppEnv>();

adminAuditLogs.use('*', adminAuthMiddleware);

adminAuditLogs.get('/', requireRole('ADMIN'), async (c) => {
  const query = c.req.query();
  const { page, limit, skip } = parsePagination(query);
  const { data, total } = await listAuditLogs({
    page, limit, skip,
    action: query.action,
    entityType: query.entityType,
    employeeId: query.employeeId,
    from: query.from,
    to: query.to,
  });
  return c.json(paginatedResponse(data, total, page, limit));
});

export default adminAuditLogs;
