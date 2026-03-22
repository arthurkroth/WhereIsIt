/**
 * Admin routes for administrative functionalities.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { Router } = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { listAuditLogs } = require("../controllers/adminController");

const adminRoutes = Router();

adminRoutes.get("/audit-logs", requireAuth, requireRole(["ADMIN"]), asyncHandler(listAuditLogs));

module.exports = { adminRoutes };