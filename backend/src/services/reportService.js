/**
 * File: reportService.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Generates system reports as .log files saved to backend/reports/.
 * Reports include a system summary, all audit events, security events,
 * and admin actions for the configured period (daily/weekly/monthly).
 *
 * SCHEDULE:
 * A node-cron job runs at 01:00 UTC every day.
 * It reads the report_schedule table and only generates a report when:
 *   daily   — every run
 *   weekly  — if last_run was more than 7 days ago
 *   monthly — if last_run was more than 28 days ago
 */

const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const { db } = require('../config/db');

// Directory where .log files are saved
const REPORTS_DIR = path.join(__dirname, '../../reports');

// ============================================================================
// SCHEDULER
// ============================================================================

/**
 * Starts the report scheduler cron job.
 * Runs at 01:00 UTC daily and decides whether to generate based on settings.
 * Called once from server.js at startup.
 */
function startReportScheduler() {
  console.log('Report scheduler started — checking daily at 01:00 UTC');

  cron.schedule('0 1 * * *', async () => {
    console.log('Report scheduler: checking if report is due...');
    await runScheduledReport();
  }, { timezone: 'UTC' });
}

/**
 * Checks the report_schedule table and generates a report if one is due.
 */
async function runScheduledReport() {
  try {
    const [rows] = await db.execute('SELECT * FROM report_schedule WHERE id = 1');
    if (rows.length === 0 || !rows[0].enabled) {
      console.log('Report scheduler: reports disabled — skipping');
      return;
    }

    const schedule = rows[0];
    const now = new Date();
    const lastRun = schedule.last_run ? new Date(schedule.last_run) : null;

    // Determine if enough time has passed since the last report
    let shouldRun = false;
    if (!lastRun) {
      shouldRun = true;
    } else {
      const daysSinceLast = (now - lastRun) / (1000 * 60 * 60 * 24);
      if (schedule.frequency === 'daily'   && daysSinceLast >= 1)  shouldRun = true;
      if (schedule.frequency === 'weekly'  && daysSinceLast >= 7)  shouldRun = true;
      if (schedule.frequency === 'monthly' && daysSinceLast >= 28) shouldRun = true;
    }

    if (!shouldRun) {
      console.log(`Report scheduler: next ${schedule.frequency} report not yet due`);
      return;
    }

    console.log(`Generating scheduled ${schedule.frequency} report...`);
    const filename = await generateReport(schedule.frequency);

    // Update last_run timestamp
    await db.execute('UPDATE report_schedule SET last_run = NOW() WHERE id = 1');
    console.log(`Scheduled report generated: ${filename}`);

  } catch (err) {
    console.error('Report scheduler error:', err.message);
  }
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

/**
 * Generates a system report and saves it as a .log file.
 * Returns the filename of the saved report.
 *
 * @param {string} frequency - 'daily' | 'weekly' | 'monthly' (affects the period covered)
 * @returns {Promise<string>} Filename of the generated report
 */
async function generateReport(frequency = 'weekly') {
  // Determine the period to cover
  const periodDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 30;
  const now = new Date();
  const periodStart = new Date(now - periodDays * 24 * 60 * 60 * 1000);

  const content = await buildReportContent(now, periodStart, frequency);

  // Filename: WhereIsIt_Report_YYYY-MM-DD_HH-MM-SS.log
  const timestamp = now.toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .split('.')[0];
  const filename = `WhereIsIt_Report_${timestamp}.log`;
  const filePath = path.join(REPORTS_DIR, filename);

  // Ensure the reports directory exists
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');

  console.log(`Report saved: ${filePath}`);
  return filename;
}

/**
 * Builds the full text content of the report.
 *
 * @param {Date} now - Report generation timestamp
 * @param {Date} periodStart - Start of the reporting period
 * @param {string} frequency - Report frequency label
 * @returns {Promise<string>} Full report text
 */
async function buildReportContent(now, periodStart, frequency) {
  const divider = '='.repeat(80);
  const lines = [];

  const formatTs = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'UTC'
    }) + ' UTC';
  };

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(divider);
  lines.push('WhereIsIt? System Report');
  lines.push(`Generated   : ${formatTs(now)}`);
  lines.push(`Report Type : ${frequency.charAt(0).toUpperCase() + frequency.slice(1)}`);
  lines.push(`Period Start: ${formatTs(periodStart)}`);
  lines.push(`Period End  : ${formatTs(now)}`);
  lines.push(divider);
  lines.push('');

  // ── System Summary ────────────────────────────────────────────────────────
  lines.push('SYSTEM SUMMARY');
  lines.push('-'.repeat(40));
  try {
    const [userStats] = await db.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN role = 'FREE'        THEN 1 ELSE 0 END) AS free_count,
        SUM(CASE WHEN role = 'PREMIUM'     THEN 1 ELSE 0 END) AS premium_count,
        SUM(CASE WHEN role = 'ADMIN'       THEN 1 ELSE 0 END) AS admin_count,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended_count
      FROM users
    `);
    const u = userStats[0];
    lines.push(`Total Users  : ${u.total}`);
    lines.push(`  FREE       : ${u.free_count}`);
    lines.push(`  PREMIUM    : ${u.premium_count}`);
    lines.push(`  ADMIN      : ${u.admin_count}`);
    lines.push(`  Suspended  : ${u.suspended_count}`);
  } catch (err) {
    lines.push(`[ERROR] Failed to fetch user stats: ${err.message}`);
  }

  lines.push('');

  try {
    const [receiptStats] = await db.execute('SELECT COUNT(*) AS total FROM receipts');
    lines.push(`Total Receipts : ${receiptStats[0].total}`);
  } catch (err) {
    lines.push(`[ERROR] Failed to fetch receipt stats: ${err.message}`);
  }

  lines.push('');

  try {
    const [ticketStats] = await db.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open'        THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
        SUM(CASE WHEN status = 'resolved'    THEN 1 ELSE 0 END) AS resolved_count
      FROM support_tickets
    `);
    const t = ticketStats[0];
    lines.push(`Support Tickets : ${t.total} total`);
    lines.push(`  Open          : ${t.open_count}`);
    lines.push(`  In Progress   : ${t.in_progress_count}`);
    lines.push(`  Resolved      : ${t.resolved_count}`);
  } catch (err) {
    lines.push(`[ERROR] Failed to fetch ticket stats: ${err.message}`);
  }

  lines.push('');
  lines.push(divider);
  lines.push('');

  // ── New Users in Period ───────────────────────────────────────────────────
  lines.push(`NEW USERS (registered in the last ${frequency === 'daily' ? '24 hours' : frequency === 'weekly' ? '7 days' : '30 days'})`);
  lines.push('-'.repeat(40));
  try {
    const [newUsers] = await db.execute(
      `SELECT id, email, first_name, last_name, role, created_at
       FROM users WHERE created_at >= ? ORDER BY created_at DESC`,
      [periodStart]
    );
    if (newUsers.length === 0) {
      lines.push('No new users registered in this period.');
    } else {
      for (const u of newUsers) {
        lines.push(`[${formatTs(u.created_at)}] #${u.id} ${u.first_name} ${u.last_name} <${u.email}> [${u.role}]`);
      }
    }
  } catch (err) {
    lines.push(`[ERROR] Failed to fetch new users: ${err.message}`);
  }

  lines.push('');
  lines.push(divider);
  lines.push('');

  // ── Security Events ───────────────────────────────────────────────────────
  lines.push('SECURITY EVENTS');
  lines.push('-'.repeat(40));
  try {
    const [securityEvents] = await db.execute(
      `SELECT al.id, al.user_id, al.action, al.details, al.ip_address, al.created_at,
              u.email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.created_at >= ?
         AND al.action IN (
           'UNAUTHORIZED_ACCESS_ATTEMPT',
           'LOGIN_ATTEMPT',
           'MFA_CONFIRM_FAILED',
           'ADMIN_ACCOUNT_SUSPENDED',
           'ADMIN_MFA_RESET',
           'ADMIN_PASSWORD_RESET'
         )
       ORDER BY al.created_at DESC`,
      [periodStart]
    );
    if (securityEvents.length === 0) {
      lines.push('No security events in this period.');
    } else {
      for (const e of securityEvents) {
        const user = e.email ? `User #${e.user_id} <${e.email}>` : `User #${e.user_id}`;
        const ip   = e.ip_address ? ` | IP: ${e.ip_address}` : '';
        lines.push(`[${formatTs(e.created_at)}] [${e.action}] ${user}${ip}`);
        if (e.details) lines.push(`  Details: ${e.details}`);
      }
    }
  } catch (err) {
    lines.push(`[ERROR] Failed to fetch security events: ${err.message}`);
  }

  lines.push('');
  lines.push(divider);
  lines.push('');

  // ── Admin Actions ─────────────────────────────────────────────────────────
  lines.push('ADMIN ACTIONS');
  lines.push('-'.repeat(40));
  try {
    const [adminActions] = await db.execute(
      `SELECT al.id, al.user_id, al.action, al.details, al.ip_address, al.created_at,
              u.email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.created_at >= ?
         AND al.action LIKE 'ADMIN_%'
       ORDER BY al.created_at DESC`,
      [periodStart]
    );
    if (adminActions.length === 0) {
      lines.push('No admin actions in this period.');
    } else {
      for (const a of adminActions) {
        const admin = a.email ? `Admin #${a.user_id} <${a.email}>` : `Admin #${a.user_id}`;
        lines.push(`[${formatTs(a.created_at)}] [${a.action}] ${admin}`);
        if (a.details) lines.push(`  Details: ${a.details}`);
      }
    }
  } catch (err) {
    lines.push(`[ERROR] Failed to fetch admin actions: ${err.message}`);
  }

  lines.push('');
  lines.push(divider);
  lines.push('');

  // ── Full Audit Log ────────────────────────────────────────────────────────
  lines.push('FULL AUDIT LOG (all events in period)');
  lines.push('-'.repeat(40));
  try {
    const [allLogs] = await db.execute(
      `SELECT al.id, al.user_id, al.action, al.details, al.ip_address, al.created_at,
              u.email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.created_at >= ?
       ORDER BY al.created_at DESC
       LIMIT 1000`,
      [periodStart]
    );
    if (allLogs.length === 0) {
      lines.push('No audit log entries in this period.');
    } else {
      for (const l of allLogs) {
        const user = l.user_id ? `#${l.user_id}${l.email ? ` <${l.email}>` : ''}` : 'system';
        const ip   = l.ip_address ? ` | ${l.ip_address}` : '';
        lines.push(`[${formatTs(l.created_at)}] [${l.action}] User ${user}${ip}`);
        if (l.details) lines.push(`  ${l.details}`);
      }
      if (allLogs.length === 1000) {
        lines.push('');
        lines.push('[NOTE] Output truncated at 1000 entries. Download audit logs from the admin panel for the full history.');
      }
    }
  } catch (err) {
    lines.push(`[ERROR] Failed to fetch audit logs: ${err.message}`);
  }

  lines.push('');
  lines.push(divider);
  lines.push('END OF REPORT');
  lines.push(divider);
  lines.push('');

  return lines.join('\n');
}

/**
 * Lists all saved report files in the reports directory.
 * Returns an array of objects with filename, size, and created date.
 *
 * @returns {Promise<Array>}
 */
async function listReportFiles() {
  try {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const files = await fs.readdir(REPORTS_DIR);

    const reportFiles = await Promise.all(
      files
        .filter(f => f.endsWith('.log') && f.startsWith('WhereIsIt_Report_'))
        .map(async (filename) => {
          const filePath = path.join(REPORTS_DIR, filename);
          const stat = await fs.stat(filePath);
          return {
            filename,
            sizeBytes: stat.size,
            createdAt: stat.birthtime
          };
        })
    );

    // Sort newest first
    return reportFiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.error('Failed to list reports:', err.message);
    return [];
  }
}

module.exports = {
  startReportScheduler,
  generateReport,
  listReportFiles,
  REPORTS_DIR
};