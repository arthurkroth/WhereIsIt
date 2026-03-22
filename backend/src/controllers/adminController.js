/**
 * Admin controller for handling administrative actions.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { db } = require("../config/db");

/**
 * GET /admin/audit-logs (ADMIN only)
 */
async function listAuditLogs(_req, res) {
  const [rows] = await db.execute(
    "SELECT id, user_id, action, details, created_at FROM audit_logs ORDER BY id DESC LIMIT 100"
  );
  res.json({ logs: rows });
}

module.exports = { listAuditLogs };