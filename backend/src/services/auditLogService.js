/**
 * Audit Log Service
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { db } = require("../config/db");

/**
 * AuditLogService
 * Handles audit logging for security monitoring and compliance.
 * 
 * FEATURES:
 * - Logs all significant user actions
 * - Includes user ID, action type, and details
 * - Timestamped automatically by database
 * - Admin can review logs for security analysis
 */
class AuditLogService {
  /**
   * Saves an audit event to the database.
   * @param {number|null} userId - User ID (null for system events)
   * @param {string} action - Action type (e.g., "LOGIN_ATTEMPT", "PASSWORD_RESET")
   * @param {string} details - Additional details about the action
   * @returns {Promise<void>}
   */
  async log(userId, action, details) {
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
      [userId, action, details]
    );
  }
}

module.exports = { AuditLogService };