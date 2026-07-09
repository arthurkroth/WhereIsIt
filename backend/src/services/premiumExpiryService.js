/**
 * File: premiumExpiryService.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Daily cron job that manages Premium subscription lifecycles:
 * - Reverts PREMIUM accounts to FREE when premium_expires_at has passed
 * - Sends a 7-day warning email before expiry
 *
 * Runs at 03:00 UTC - after the warranty alert (00:00) and report
 * scheduler (01:00) to avoid overlapping cron windows.
 */

const cron = require('node-cron');
const { db } = require('../config/db');
const { env } = require('../config/env');
const emailService = require('./emailService');

// Starts the premium subscription expiry cron and the monthly audit log
// retention cron (deletes entries older than 2 years per the privacy policy).
function startPremiumExpiryService() {
  console.log('Premium expiry service started - running daily at 03:00 UTC');

  cron.schedule('0 3 * * *', async () => {
    console.log('Running daily premium subscription expiry check...');
    await runDailyExpiryCheck();
  }, { timezone: 'UTC' });

  // Run on the 1st of each month at 04:00 UTC to clean up old audit logs.
  cron.schedule('0 4 1 * *', async () => {
    console.log('Running monthly audit log retention cleanup...');
    await purgeOldAuditLogs();
  }, { timezone: 'UTC' });
}

// Checks for expired and soon-to-expire Premium subscriptions and acts on them.
async function runDailyExpiryCheck() {
  try {
    await expireSubscriptions();
    await sendExpiryWarnings();
  } catch (err) {
    console.error('Premium expiry cron error:', err.message);
  }
}

// Downgrades all PREMIUM accounts whose expiry date has passed.
async function expireSubscriptions() {
  const [expiredUsers] = await db.execute(
    `SELECT id, email, first_name
     FROM users
     WHERE role = 'PREMIUM'
       AND premium_permanent = FALSE
       AND premium_expires_at IS NOT NULL
       AND premium_expires_at < NOW()`
  );

  if (expiredUsers.length === 0) return;

  console.log(`Premium expiry: ${expiredUsers.length} subscription(s) to expire`);

  for (const user of expiredUsers) {
    try {
      await db.execute(
        `UPDATE users SET role = 'FREE', premium_expires_at = NULL WHERE id = ?`,
        [user.id]
      );

      await db.execute(
        `INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)`,
        [user.id, 'PREMIUM_EXPIRED', `Premium subscription expired for user ${user.id} (${user.email})`]
      );

      await emailService.sendPremiumExpired(user.email, user.first_name);

      console.log(`Premium expired for user ${user.id} (${user.email})`);
    } catch (err) {
      console.error(`Failed to expire premium for user ${user.id}:`, err.message);
    }
  }
}

// Sends a 7-day warning email to users whose subscription expires within a week.
async function sendExpiryWarnings() {
  const [warningUsers] = await db.execute(
    `SELECT id, email, first_name, premium_expires_at
     FROM users
     WHERE role = 'PREMIUM'
       AND premium_permanent = FALSE
       AND premium_expires_at IS NOT NULL
       AND premium_expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)`
  );

  if (warningUsers.length === 0) return;

  console.log(`Premium expiry: sending ${warningUsers.length} warning email(s)`);

  for (const user of warningUsers) {
    try {
      await emailService.sendPremiumExpiryWarning(user.email, user.first_name, user.premium_expires_at);
      console.log(`Expiry warning sent to user ${user.id} (${user.email})`);
    } catch (err) {
      console.error(`Failed to send expiry warning to user ${user.id}:`, err.message);
    }
  }
}

// Deletes audit log entries older than 2 years, as stated in the privacy policy.
// Entries with user_id = NULL (from deleted accounts) are also eligible for cleanup.
async function purgeOldAuditLogs() {
  try {
    const [result] = await db.execute(
      `DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 YEAR)`
    );
    const deleted = result.affectedRows;
    if (deleted > 0) {
      console.log(`Audit log retention: deleted ${deleted} entr${deleted !== 1 ? 'ies' : 'y'} older than 2 years`);
    } else {
      console.log('Audit log retention: no entries old enough to purge');
    }
  } catch (err) {
    console.error('Audit log retention error:', err.message);
  }
}

module.exports = { startPremiumExpiryService, runDailyExpiryCheck, purgeOldAuditLogs };
