/**
 * File: adminRoutes.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * ADDED: Report generation, listing, downloading, and schedule routes.
 */

const { Router } = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const {
  getDashboardStats,
  searchUsers,
  getUserById,
  changeTier,
  suspendAccount,
  reactivateAccount,
  adminResetPassword,
  adminResetMfa,
  listTickets,
  getTicket,
  updateTicket,
  createTicket,
  listAuditLogs,
  getReportSchedule,
  updateReportSchedule,
  generateReportNow,
  listReports,
  downloadReportFile
} = require('../controllers/adminController');

const adminRoutes = Router();

// All admin routes require authentication and ADMIN role
adminRoutes.use(requireAuth);
adminRoutes.use(requireRole(['ADMIN']));

// Dashboard
adminRoutes.get('/stats',                    asyncHandler(getDashboardStats));

// User management
adminRoutes.get('/users',                    asyncHandler(searchUsers));
adminRoutes.get('/users/:id',                asyncHandler(getUserById));
adminRoutes.put('/users/:id/tier',           asyncHandler(changeTier));
adminRoutes.put('/users/:id/suspend',        asyncHandler(suspendAccount));
adminRoutes.put('/users/:id/reactivate',     asyncHandler(reactivateAccount));
adminRoutes.post('/users/:id/reset-password',asyncHandler(adminResetPassword));
adminRoutes.delete('/users/:id/mfa',         asyncHandler(adminResetMfa));

// Support tickets
adminRoutes.get('/tickets',                  asyncHandler(listTickets));
adminRoutes.get('/tickets/:id',              asyncHandler(getTicket));
adminRoutes.put('/tickets/:id',              asyncHandler(updateTicket));
adminRoutes.post('/tickets',                 asyncHandler(createTicket));

// Audit logs
adminRoutes.get('/audit-logs',               asyncHandler(listAuditLogs));

// Reports — schedule management
adminRoutes.get('/reports/schedule',         asyncHandler(getReportSchedule));
adminRoutes.put('/reports/schedule',         asyncHandler(updateReportSchedule));

// Reports — generation and file access
// NOTE: /reports/generate and /reports/download/:filename must be registered
// BEFORE /reports/:anything to avoid Express matching them as dynamic params
adminRoutes.post('/reports/generate',        asyncHandler(generateReportNow));
adminRoutes.get('/reports/download/:filename', asyncHandler(downloadReportFile));
adminRoutes.get('/reports',                  asyncHandler(listReports));

module.exports = { adminRoutes };