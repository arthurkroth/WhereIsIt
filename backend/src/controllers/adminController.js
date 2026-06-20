/**
 * Admin Controller — System Management
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * ADDED: Report generation, listing, downloading, and schedule management.
 */

const { db } = require('../config/db');
const { env } = require('../config/env');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const emailService = require('../services/emailService');
const { generateReport, listReportFiles, REPORTS_DIR } = require('../services/reportService');

// ============================================================================
// DASHBOARD
// ============================================================================

async function getDashboardStats(req, res) {
  const adminId = req.user.userId;
  try {
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)",
      [adminId, 'ADMIN_DASHBOARD_VIEWED', 'Admin viewed dashboard statistics', req.ip]
    );
  } catch {}

  const [userStats] = await db.execute(`
    SELECT
      COUNT(*)                                                    AS total,
      SUM(CASE WHEN role = 'FREE'        THEN 1 ELSE 0 END)      AS free_count,
      SUM(CASE WHEN role = 'PREMIUM'     THEN 1 ELSE 0 END)      AS premium_count,
      SUM(CASE WHEN role = 'ADMIN'       THEN 1 ELSE 0 END)      AS admin_count,
      SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END)      AS suspended_count,
      SUM(CASE WHEN email_verified = TRUE THEN 1 ELSE 0 END)     AS verified_count
    FROM users
  `);
  const [receiptStats] = await db.execute('SELECT COUNT(*) AS total FROM receipts');
  const [ticketStats] = await db.execute(`
    SELECT
      COUNT(*)                                                         AS total,
      SUM(CASE WHEN status = 'open'        THEN 1 ELSE 0 END)        AS open_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)        AS in_progress_count,
      SUM(CASE WHEN status = 'resolved'    THEN 1 ELSE 0 END)        AS resolved_count
    FROM support_tickets
  `);
  const [recentActions] = await db.execute(`
    SELECT al.id, al.user_id, al.action, al.details, al.created_at,
           u.first_name, u.last_name, u.email
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.action LIKE 'ADMIN_%'
    ORDER BY al.created_at DESC LIMIT 5
  `);

  return res.json({
    success: true,
    stats: {
      users: {
        total:     parseInt(userStats[0].total),
        free:      parseInt(userStats[0].free_count),
        premium:   parseInt(userStats[0].premium_count),
        admin:     parseInt(userStats[0].admin_count),
        suspended: parseInt(userStats[0].suspended_count),
        verified:  parseInt(userStats[0].verified_count)
      },
      receipts: { total: parseInt(receiptStats[0].total) },
      tickets: {
        total:      parseInt(ticketStats[0].total),
        open:       parseInt(ticketStats[0].open_count),
        inProgress: parseInt(ticketStats[0].in_progress_count),
        resolved:   parseInt(ticketStats[0].resolved_count)
      }
    },
    recentActions
  });
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

async function searchUsers(req, res) {
  const { q = '', role = 'all', status = 'all' } = req.query;
  let query = `SELECT id, email, first_name, last_name, role, status, email_verified, mfa_enabled, created_at FROM users WHERE 1=1`;
  const params = [];
  if (q.trim()) { query += ` AND (email LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ? OR id = ?)`; params.push(`%${q}%`, `%${q}%`, parseInt(q) || 0); }
  if (role !== 'all')   { query += ` AND role = ?`;   params.push(role); }
  if (status !== 'all') { query += ` AND status = ?`; params.push(status); }
  query += ` ORDER BY created_at DESC LIMIT 100`;
  const [users] = await db.execute(query, params);
  return res.json({ success: true, users: users.map(u => ({ ...u, mfaEnabled: u.mfa_enabled === 1 || u.mfa_enabled === true, emailVerified: u.email_verified === 1 || u.email_verified === true })) });
}

async function getUserById(req, res) {
  const { id } = req.params;
  const [userRows] = await db.execute(`SELECT id, email, first_name, last_name, role, status, email_verified, mfa_enabled, created_at FROM users WHERE id = ?`, [id]);
  if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userRows[0];
  const [receiptCount] = await db.execute('SELECT COUNT(*) AS count FROM receipts WHERE user_id = ?', [id]);
  const [codeCount] = await db.execute('SELECT COUNT(*) AS count FROM mfa_recovery_codes WHERE user_id = ? AND used = FALSE', [id]);
  const [recentLogins] = await db.execute(`SELECT created_at, action, details, ip_address FROM audit_logs WHERE user_id = ? AND action IN ('LOGIN_SUCCESS', 'LOGIN_ATTEMPT') ORDER BY created_at DESC LIMIT 10`, [id]);
  const [ownHistory] = await db.execute(`SELECT created_at, action, details FROM audit_logs WHERE user_id = ? AND action IN ('REGISTER','EMAIL_VERIFIED','EMAIL_CHANGED','PASSWORD_CHANGED','MFA_ENABLED','MFA_DISABLED','RECEIPT_UPLOADED','RECEIPT_DELETED','RECEIPT_CSV_EXPORTED') ORDER BY created_at DESC LIMIT 15`, [id]);
  const [adminHistory] = await db.execute(`SELECT created_at, action, details FROM audit_logs WHERE action LIKE 'ADMIN_%' AND details LIKE ? ORDER BY created_at DESC LIMIT 10`, [`%user ${id}%`]);
  const actionHistory = [...ownHistory, ...adminHistory].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
  let premiumSettings = null;
  if (user.role === 'PREMIUM') {
    const [psRows] = await db.execute('SELECT alerts_enabled, alert_timeframe_days, alert_frequency, last_alert_sent FROM premium_settings WHERE user_id = ?', [id]);
    if (psRows.length > 0) premiumSettings = psRows[0];
  }
  return res.json({ success: true, user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, status: user.status, mfaEnabled: user.mfa_enabled === 1 || user.mfa_enabled === true, emailVerified: user.email_verified === 1 || user.email_verified === true, createdAt: user.created_at, receiptCount: parseInt(receiptCount[0].count), remainingRecoveryCodes: parseInt(codeCount[0].count), recentLogins, actionHistory, premiumSettings } });
}

// ============================================================================
// ACCOUNT ACTIONS
// ============================================================================

async function changeTier(req, res) {
  const adminId = req.user.userId;
  const { id } = req.params;
  const { newTier, reason } = req.body;
  if (!['FREE', 'PREMIUM'].includes(newTier)) return res.status(400).json({ error: 'Invalid tier' });
  if (!reason || reason.trim().length < 10) return res.status(400).json({ error: 'Reason must be at least 10 characters' });
  if (parseInt(id) === adminId) return res.status(400).json({ error: 'You cannot change your own tier' });
  const [userRows] = await db.execute('SELECT id, email, first_name, last_name, role FROM users WHERE id = ?', [id]);
  if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userRows[0];
  const oldTier = user.role;
  if (oldTier === newTier) return res.status(400).json({ error: `User is already on the ${newTier} tier` });
  await db.execute('UPDATE users SET role = ? WHERE id = ?', [newTier, id]);
  try {
    await emailService.sendEmail({
      to: user.email,
      subject: `Your WhereIsIt? account has been updated to ${newTier}`,
      html: `<p>Hi ${user.first_name}, your account tier has been changed from <strong>${oldTier}</strong> to <strong>${newTier}</strong>.</p>`
    });
  } catch (err) { console.error('Failed to send tier change email:', err.message); }
  await db.execute("INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)", [adminId, 'ADMIN_TIER_CHANGE', `Admin changed user ${id} (${user.email}) from ${oldTier} to ${newTier}. Reason: ${reason.trim()}`, req.ip]);
  return res.json({ success: true, message: `User tier changed from ${oldTier} to ${newTier}` });
}

async function suspendAccount(req, res) {
  const adminId = req.user.userId;
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason || reason.trim().length < 20) return res.status(400).json({ error: 'Suspension reason must be at least 20 characters' });
  if (parseInt(id) === adminId) return res.status(400).json({ error: 'You cannot suspend your own account' });
  const [userRows] = await db.execute('SELECT id, email, first_name, status, role FROM users WHERE id = ?', [id]);
  if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userRows[0];
  if (user.status === 'suspended') return res.status(400).json({ error: 'Account is already suspended.', alreadySuspended: true });
  if (user.role === 'ADMIN') return res.status(400).json({ error: 'Administrator accounts cannot be suspended' });
  await db.execute('UPDATE users SET status = ? WHERE id = ?', ['suspended', id]);
  try {
    await emailService.sendEmail({
      to: user.email,
      subject: 'Your WhereIsIt? account has been suspended',
      html: `<p>Hi ${user.first_name}, your account has been suspended. Please contact support.</p>`
    });
  } catch (err) { console.error('Failed to send suspension email:', err.message); }
  await db.execute("INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)", [adminId, 'ADMIN_ACCOUNT_SUSPENDED', `Admin suspended user ${id} (${user.email}). Reason: ${reason.trim()}`, req.ip]);
  return res.json({ success: true, message: 'Account suspended successfully' });
}

async function reactivateAccount(req, res) {
  const adminId = req.user.userId;
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason || reason.trim().length < 10) return res.status(400).json({ error: 'Reason must be at least 10 characters' });
  const [userRows] = await db.execute('SELECT id, email, first_name, status FROM users WHERE id = ?', [id]);
  if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userRows[0];
  if (user.status !== 'suspended') return res.status(400).json({ error: 'Account is not currently suspended' });
  await db.execute('UPDATE users SET status = ? WHERE id = ?', ['active', id]);
  try {
    await emailService.sendEmail({
      to: user.email,
      subject: 'Your WhereIsIt? account has been reactivated',
      html: `<p>Hi ${user.first_name}, your account has been reactivated. You can now log in.</p>`
    });
  } catch (err) { console.error('Failed to send reactivation email:', err.message); }
  await db.execute("INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)", [adminId, 'ADMIN_ACCOUNT_REACTIVATED', `Admin reactivated user ${id} (${user.email}). Reason: ${reason.trim()}`, req.ip]);
  return res.json({ success: true, message: 'Account reactivated successfully' });
}

async function adminResetPassword(req, res) {
  const adminId = req.user.userId;
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason || reason.trim().length < 10) return res.status(400).json({ error: 'Reason must be at least 10 characters' });
  const [userRows] = await db.execute('SELECT id, email, first_name FROM users WHERE id = ?', [id]);
  if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userRows[0];
  const plainToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.execute('UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?', [hashedToken, expiresAt, id]);
  try {
    const resetUrl = `${env.appBaseUrl}/reset-password?token=${plainToken}`;
    await emailService.sendEmail({
      to: user.email,
      subject: 'Password reset for your WhereIsIt? account',
      html: `<p>Hi ${user.first_name}, an admin has triggered a password reset. <a href="${resetUrl}">Reset your password</a> (expires in 24 hours).</p>`
    });
  } catch (err) { console.error('Failed to send reset email:', err.message); }
  await db.execute("INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)", [adminId, 'ADMIN_PASSWORD_RESET', `Admin initiated password reset for user ${id} (${user.email}). Reason: ${reason.trim()}`, req.ip]);
  return res.json({ success: true, message: 'Password reset link sent to user' });
}

async function adminResetMfa(req, res) {
  const adminId = req.user.userId;
  const { id } = req.params;
  const { justification, adminPassword } = req.body;
  if (!justification || justification.trim().length < 50) return res.status(400).json({ error: 'Justification must be at least 50 characters for MFA reset' });
  if (!adminPassword) return res.status(400).json({ error: 'Your password is required to perform this action' });
  const [adminRows] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [adminId]);
  if (adminRows.length === 0) return res.status(404).json({ error: 'Admin not found' });
  const passwordValid = await bcrypt.compare(adminPassword, adminRows[0].password_hash);
  if (!passwordValid) return res.status(401).json({ error: 'Your password is incorrect' });
  const [userRows] = await db.execute('SELECT id, email, first_name, mfa_enabled FROM users WHERE id = ?', [id]);
  if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
  const user = userRows[0];
  const mfaWasEnabled = user.mfa_enabled === 1 || user.mfa_enabled === true;
  await db.execute('UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = ?', [id]);
  await db.execute('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [id]);
  try {
    await emailService.sendEmail({
      to: user.email,
      subject: '⚠ Security Alert: MFA has been reset on your account',
      html: `<p>Hi ${user.first_name}, <strong>MFA has been disabled on your account by an administrator.</strong> If you did not request this, contact support immediately.</p>`
    });
  } catch (err) { console.error('Failed to send MFA reset notification:', err.message); }
  await db.execute("INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)", [adminId, 'ADMIN_MFA_RESET', `SECURITY: Admin reset MFA for user ${id} (${user.email}). MFA was ${mfaWasEnabled ? 'enabled' : 'disabled'}. Justification: ${justification.trim()}`, req.ip]);
  return res.json({ success: true, message: 'MFA has been reset. User has been notified.' });
}

// ============================================================================
// SUPPORT TICKETS
// ============================================================================

async function listTickets(req, res) {
  const { status = 'all', priority = 'all' } = req.query;
  let query = `SELECT st.id, st.subject, st.status, st.priority, st.created_at, st.updated_at, st.user_reply, u.id AS user_id, u.email, u.first_name, u.last_name FROM support_tickets st INNER JOIN users u ON u.id = st.user_id WHERE 1=1`;
  const params = [];
  if (status !== 'all')   { query += ` AND st.status = ?`;   params.push(status); }
  if (priority !== 'all') { query += ` AND st.priority = ?`; params.push(priority); }
  query += ` ORDER BY CASE st.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, CASE st.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, st.created_at DESC`;
  const [tickets] = await db.execute(query, params);
  return res.json({ success: true, tickets });
}

async function getTicket(req, res) {
  const { id } = req.params;
  const [rows] = await db.execute(`SELECT st.*, u.id AS user_id, u.email, u.first_name, u.last_name, u.role, a.first_name AS admin_first_name, a.last_name AS admin_last_name FROM support_tickets st INNER JOIN users u ON u.id = st.user_id LEFT JOIN users a ON a.id = st.responded_by WHERE st.id = ?`, [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
  return res.json({ success: true, ticket: rows[0] });
}

async function updateTicket(req, res) {
  const adminId = req.user.userId;
  const { id } = req.params;
  const { response, status } = req.body;
  const validStatuses = ['open', 'in_progress', 'resolved'];
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const [rows] = await db.execute(`SELECT st.*, u.email, u.first_name FROM support_tickets st INNER JOIN users u ON u.id = st.user_id WHERE st.id = ?`, [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
  const ticket = rows[0];
  const updates = []; const params = [];
  if (response !== undefined) { updates.push('admin_response = ?', 'responded_by = ?'); params.push(response.trim(), adminId); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  await db.execute(`UPDATE support_tickets SET ${updates.join(', ')} WHERE id = ?`, params);
  if (response) {
    try {
      await emailService.sendEmail({
        to: ticket.email,
        subject: `Re: ${ticket.subject} [Ticket #${id}]`,
        html: `<p>Hi ${ticket.first_name},</p><blockquote>${response.trim()}</blockquote><p>Status: <strong>${status || ticket.status}</strong></p>`
      });
    } catch (err) { console.error('Failed to send ticket response email:', err.message); }
  }
  await db.execute("INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)", [adminId, 'ADMIN_TICKET_UPDATED', `Admin updated ticket #${id}. Status: ${status || 'unchanged'}`, req.ip]);
  return res.json({ success: true, message: 'Ticket updated successfully' });
}

async function createTicket(req, res) {
  const { userId, subject, message, priority = 'medium' } = req.body;
  if (!userId || !subject || !message) return res.status(400).json({ error: 'userId, subject, and message are required' });
  const [userRows] = await db.execute('SELECT id FROM users WHERE id = ?', [userId]);
  if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
  const [result] = await db.execute('INSERT INTO support_tickets (user_id, subject, message, priority) VALUES (?, ?, ?, ?)', [userId, subject.trim().substring(0, 200), message.trim(), priority]);
  return res.status(201).json({ success: true, ticketId: result.insertId });
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

async function listAuditLogs(req, res) {
  const { q = '', action = '', userId = '', dateFrom = '', dateTo = '', limit = 100 } = req.query;
  const safeLimit = Math.min(parseInt(limit) || 100, 500);
  let query = `SELECT al.id, al.user_id, al.action, al.details, al.ip_address, al.created_at, u.email, u.first_name, u.last_name FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id WHERE 1=1`;
  const params = [];
  if (q.trim()) { query += ` AND (al.action LIKE ? OR al.details LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }
  if (action)   { query += ` AND al.action = ?`;        params.push(action); }
  if (userId)   { query += ` AND al.user_id = ?`;       params.push(parseInt(userId)); }
  if (dateFrom) { query += ` AND DATE(al.created_at) >= ?`; params.push(dateFrom); }
  if (dateTo)   { query += ` AND DATE(al.created_at) <= ?`; params.push(dateTo); }
  query += ` ORDER BY al.id DESC LIMIT ${safeLimit}`;
  const [rows] = await db.execute(query, params);
  return res.json({ logs: rows, total: rows.length });
}

// ============================================================================
// REPORTS
// ============================================================================

/**
 * GET /admin/reports/schedule
 * Returns the current report schedule settings.
 */
async function getReportSchedule(req, res) {
  const [rows] = await db.execute('SELECT * FROM report_schedule WHERE id = 1');
  if (rows.length === 0) {
    return res.json({ success: true, schedule: { enabled: false, frequency: 'weekly', lastRun: null } });
  }
  const s = rows[0];
  return res.json({
    success: true,
    schedule: {
      enabled:   s.enabled === 1 || s.enabled === true,
      frequency: s.frequency,
      lastRun:   s.last_run
    }
  });
}

/**
 * PUT /admin/reports/schedule
 * Updates the report schedule settings.
 * Body: { enabled, frequency }
 */
async function updateReportSchedule(req, res) {
  const adminId = req.user.userId;
  const { enabled, frequency } = req.body;

  const validFrequencies = ['daily', 'weekly', 'monthly'];
  if (frequency && !validFrequencies.includes(frequency)) {
    return res.status(400).json({ error: 'Invalid frequency. Must be daily, weekly, or monthly' });
  }

  await db.execute(
    `INSERT INTO report_schedule (id, enabled, frequency)
     VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), frequency = VALUES(frequency)`,
    [enabled !== undefined ? enabled : false, frequency || 'weekly']
  );

  try {
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)",
      [adminId, 'ADMIN_REPORT_SCHEDULE_UPDATED',
       `Report schedule updated: enabled=${enabled}, frequency=${frequency}`, req.ip]
    );
  } catch {}

  return res.json({ success: true, message: 'Report schedule updated' });
}

/**
 * POST /admin/reports/generate
 * Generates a report on demand immediately.
 * Uses the currently configured frequency for the period covered.
 */
async function generateReportNow(req, res) {
  const adminId = req.user.userId;

  // Use the configured frequency so the period covered matches expectations
  const [rows] = await db.execute('SELECT frequency FROM report_schedule WHERE id = 1');
  const frequency = rows[0]?.frequency || 'weekly';

  try {
    const filename = await generateReport(frequency);

    // Update last_run
    await db.execute('UPDATE report_schedule SET last_run = NOW() WHERE id = 1');

    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)",
        [adminId, 'ADMIN_REPORT_GENERATED', `Admin manually generated report: ${filename}`, req.ip]
      );
    } catch {}

    return res.json({ success: true, filename, message: `Report generated: ${filename}` });
  } catch (err) {
    console.error('Report generation error:', err.message);
    return res.status(500).json({ error: 'Failed to generate report: ' + err.message });
  }
}

/**
 * GET /admin/reports
 * Lists all saved .log report files with filename, size, and date.
 */
async function listReports(req, res) {
  const files = await listReportFiles();
  return res.json({ success: true, reports: files });
}

/**
 * GET /admin/reports/download/:filename
 * Downloads a specific .log report file.
 * Filename is validated to prevent path traversal attacks.
 */
async function downloadReportFile(req, res) {
  const { filename } = req.params;

  // Security: only allow our own report filenames — reject anything with path separators or dots
  if (!/^WhereIsIt_Report_[\d\-_T]+\.log$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join(REPORTS_DIR, filename);

  try {
    await fs.access(filePath);
  } catch {
    return res.status(404).json({ error: 'Report file not found' });
  }

  return res.download(filePath, filename);
}

module.exports = {
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
};