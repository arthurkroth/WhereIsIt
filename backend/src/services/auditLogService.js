/**
 * Audit Log Service
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { db } = require("../config/db");

/**
 * Basic audit log storage (admin role can then review).
 */
class AuditLogService {
  /**
   * Saves an audit event.
   * @param {number|null} userId
   * @param {string} action
   * @param {string} details
   */
  async log(userId, action, details) {
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
      [userId, action, details]
    );
  }
}

module.exports = { AuditLogService };