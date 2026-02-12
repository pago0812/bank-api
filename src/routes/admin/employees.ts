import { Hono } from 'hono';
import { adminAuthMiddleware, requireRole } from '../../middleware/admin-auth.js';
import * as employeeService from '../../services/employee.service.js';
import { regenerateApiToken } from '../../services/api-token.service.js';
import { createAuditLog } from '../../services/audit.service.js';
import { validate, createEmployeeSchema, updateEmployeeSchema } from '../../lib/validation.js';
import { parsePagination, paginatedResponse } from '../../lib/pagination.js';
import type { AppEnv } from '../../lib/types.js';

const adminEmployees = new Hono<AppEnv>();

adminEmployees.use('*', adminAuthMiddleware);
adminEmployees.use('*', requireRole('ADMIN'));

// Create employee
adminEmployees.post('/', async (c) => {
  const body = await c.req.json();
  const data = validate(createEmployeeSchema, body);

  const result = await employeeService.createEmployee(data);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'EMPLOYEE_CREATED',
    entityType: 'Employee',
    entityId: result.id,
    details: { employeeId: data.employeeId, role: data.role },
  });

  return c.json(result, 201);
});

// List employees
adminEmployees.get('/', async (c) => {
  const query = c.req.query();
  const pagination = parsePagination(query);

  const { data, total } = await employeeService.listEmployees({
    ...pagination,
    role: query.role,
    active: query.active,
    search: query.search,
  });

  return c.json(paginatedResponse(data, total, pagination.page, pagination.limit));
});

// Get employee
adminEmployees.get('/:id', async (c) => {
  const id = c.req.param('id');
  const employee = await employeeService.getEmployee(id);
  return c.json(employee);
});

// Update employee
adminEmployees.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const data = validate(updateEmployeeSchema, body);

  const employee = await employeeService.updateEmployee(id, data);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'EMPLOYEE_UPDATED',
    entityType: 'Employee',
    entityId: id,
    details: data,
  });

  return c.json(employee);
});

// Deactivate employee
adminEmployees.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await employeeService.deactivateEmployee(id);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'EMPLOYEE_DEACTIVATED',
    entityType: 'Employee',
    entityId: id,
    details: {},
  });

  return c.json(result);
});

// Regenerate API token (BOT only)
adminEmployees.post('/:id/regenerate-token', async (c) => {
  const id = c.req.param('id');

  const employee = await employeeService.getEmployee(id);
  if (employee.role !== 'BOT') {
    return c.json({ status: 422, code: 'VALIDATION_ERROR', message: 'Only BOT employees have API tokens' }, 422);
  }

  const { rawToken, apiToken } = await regenerateApiToken(id);

  await createAuditLog({
    employeeId: c.get('employeeId'),
    action: 'API_TOKEN_REGENERATED',
    entityType: 'Employee',
    entityId: id,
    details: { tokenPrefix: apiToken.prefix },
  });

  return c.json({
    rawApiToken: rawToken,
    apiToken: {
      id: apiToken.id,
      prefix: apiToken.prefix,
      name: apiToken.name,
      active: apiToken.active,
      lastUsedAt: apiToken.lastUsedAt,
      createdAt: apiToken.createdAt,
    },
  });
});

export default adminEmployees;
