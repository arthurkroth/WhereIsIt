/**
 * Warranty Alert Service for sending automated emails to Premium users about expiring warranties.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Automated warranty alert service for Premium users.
 * Runs as a scheduled background process using node-cron.
 *
 * SCHEDULE:
 * - Daily digest:   runs at midnight UTC every day
 * - Weekly summary: same cron, but only sends emails on Mondays
 * - Immediate:      same cron, sends individual emails per expiring item
 *
 * FLOW:
 * 1. Query all Premium users with alerts_enabled = true
 * 2. For each user, load alert preferences from premium_settings
 * 3. Query receipts expiring within their configured timeframe
 * 4. Send appropriate email based on frequency setting
 * 5. Log the alert event in audit_logs
 *
 * TEST ALERTS:
 * runTestAlertForUser(userId) can be called manually to send a test email
 * for a specific user. It uses a 365-day window to guarantee findings and
 * falls back to a sample email if the user has no receipts at all.
 */

const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { db } = require('../config/db');
const { EncryptionService } = require('../services/encryptionService');
const emailService = require('../services/emailService');

const encryption = new EncryptionService();

/**
 * Starts the warranty alert cron job.
 * Called once from server.js at startup.
 * Runs at midnight UTC every day.
 */
function startWarrantyAlertService() {
  console.log('Warranty alert service started — running daily at midnight UTC');

  // '0 0 * * *' = every day at 00:00 UTC
  cron.schedule('0 0 * * *', async () => {
    console.log('Running daily warranty alert check...');
    await runDailyWarrantyCheck();
  }, { timezone: 'UTC' });
}

/**
 * Main daily warranty check.
 * Queries all eligible Premium users and sends alerts where warranted.
 */
async function runDailyWarrantyCheck() {
  try {
    const [users] = await db.execute(
      `SELECT u.id, u.email, u.first_name, ps.alert_timeframe_days,
              ps.alert_frequency, ps.last_alert_sent
       FROM users u
       INNER JOIN premium_settings ps ON ps.user_id = u.id
       WHERE u.role = 'PREMIUM'
         AND ps.alerts_enabled = TRUE`,
      []
    );

    console.log(`Warranty check: found ${users.length} Premium user(s) with alerts enabled`);

    for (const user of users) {
      try {
        await processUserWarrantyAlerts(user);
      } catch (err) {
        console.error(`Warranty alert failed for user ${user.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Warranty alert cron error:', err.message);
  }
}

/**
 * Sends a test warranty alert email for a specific user.
 * Uses a 365-day window to guarantee at least some results.
 * If the user has no receipts at all, sends a sample test email.
 * Returns the Ethereal preview URL so the console (and optionally
 * the frontend) can display it.
 *
 * @param {number} userId - ID of the Premium user requesting the test
 * @returns {Promise<{sent: boolean, previewUrl: string|null, itemCount: number}>}
 */
async function runTestAlertForUser(userId) {
  // Fetch user details and their alert preferences
  const [userRows] = await db.execute(
    `SELECT u.id, u.email, u.first_name,
            COALESCE(ps.alert_timeframe_days, 30) AS alert_timeframe_days,
            COALESCE(ps.alert_frequency, 'daily')  AS alert_frequency
     FROM users u
     LEFT JOIN premium_settings ps ON ps.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );

  if (userRows.length === 0) {
    throw new Error('User not found');
  }

  const user = userRows[0];

  // Use 365 days so the test always finds something if the user has receipts
  let expiringItems = await getExpiringWarranties(userId, 365);

  // If still no items, send a sample test email explaining this
  if (expiringItems.length === 0) {
    const previewUrl = await sendSampleTestEmail(user);
    return { sent: true, previewUrl, itemCount: 0, sample: true };
  }

  // Send the real alert using the user's configured frequency
  let previewUrl = null;
  if (user.alert_frequency === 'immediate') {
    // Only send the first item for the test to avoid spamming
    previewUrl = await sendImmediateAlert(user, expiringItems[0]);
  } else {
    previewUrl = await sendDigestAlert(user, expiringItems);
  }

  // Log the test alert
  try {
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
      [userId, 'WARRANTY_ALERT_TEST', `Test alert sent for ${expiringItems.length} item(s)`]
    );
  } catch (err) {
    console.log('Audit log skipped:', err.message);
  }

  return { sent: true, previewUrl, itemCount: expiringItems.length, sample: false };
}

/**
 * Processes warranty alerts for a single Premium user during the daily cron run.
 *
 * @param {Object} user - User row with alert preferences
 */
async function processUserWarrantyAlerts(user) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday

  // For weekly frequency, only send on Mondays
  if (user.alert_frequency === 'weekly' && dayOfWeek !== 1) return;

  const expiringItems = await getExpiringWarranties(user.id, user.alert_timeframe_days);

  if (expiringItems.length === 0) {
    console.log(`No expiring warranties for user ${user.id} — skipping`);
    return;
  }

  console.log(`User ${user.id}: found ${expiringItems.length} expiring warranty item(s)`);

  if (user.alert_frequency === 'immediate') {
    for (const item of expiringItems) {
      await sendImmediateAlert(user, item);
    }
  } else {
    await sendDigestAlert(user, expiringItems);
  }

  // Update last_alert_sent timestamp
  await db.execute(
    'UPDATE premium_settings SET last_alert_sent = NOW() WHERE user_id = ?',
    [user.id]
  );

  try {
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
      [user.id, 'WARRANTY_ALERT_SENT',
       `Sent ${user.alert_frequency} alert for ${expiringItems.length} item(s)`]
    );
  } catch (err) {
    console.log('Audit log skipped:', err.message);
  }
}

/**
 * Queries the database for receipts with warranties expiring within
 * the given number of days. Decrypts store names and product descriptions.
 *
 * @param {number} userId
 * @param {number} timeframeDays
 * @returns {Promise<Array>}
 */
async function getExpiringWarranties(userId, timeframeDays) {
  const [receipts] = await db.execute(
    `SELECT r.id, r.store_name_enc, r.purchase_date, r.warranty_months,
            DATE_ADD(r.purchase_date, INTERVAL r.warranty_months MONTH) AS warranty_expiry
     FROM receipts r
     WHERE r.user_id = ?
       AND DATE_ADD(r.purchase_date, INTERVAL r.warranty_months MONTH)
           BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
     ORDER BY warranty_expiry ASC`,
    [userId, timeframeDays]
  );

  const results = [];

  for (const receipt of receipts) {
    try {
      const [items] = await db.execute(
        'SELECT product_desc_enc FROM receipt_items WHERE receipt_id = ? LIMIT 1',
        [receipt.id]
      );

      const storeName = encryption.decrypt(receipt.store_name_enc);
      const productDesc = items.length > 0
        ? encryption.decrypt(items[0].product_desc_enc)
        : 'Unknown product';

      const expiryDate = new Date(receipt.warranty_expiry);
      const today = new Date();
      const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

      results.push({
        receiptId: receipt.id,
        storeName,
        productDescription: productDesc,
        purchaseDate: receipt.purchase_date,
        warrantyExpiry: receipt.warranty_expiry,
        daysLeft
      });
    } catch (err) {
      console.error('Error processing receipt', receipt.id, ':', err.message);
    }
  }

  return results;
}

/**
 * Sends a digest email listing all expiring warranty items.
 * Used for daily and weekly frequency settings.
 * Returns the Ethereal preview URL.
 *
 * @param {Object} user
 * @param {Array} items
 * @returns {Promise<string|null>} Ethereal preview URL
 */
async function sendDigestAlert(user, items) {
  const subject = `WhereIsIt? — ${items.length} warranty${items.length > 1 ? 'ies' : 'y'} expiring soon`;

  const itemRows = items.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.storeName}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.productDescription}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">
        ${new Date(item.warrantyExpiry).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; color: ${item.daysLeft <= 7 ? '#dc3545' : '#fd7e14'};">
        <strong>${item.daysLeft} day${item.daysLeft !== 1 ? 's' : ''}</strong>
      </td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto;">
      <h2 style="color: #0d6efd;">Warranty Expiry Alert</h2>
      <p>Hi ${user.first_name},</p>
      <p>The following warranties are expiring soon. Log in to WhereIsIt? to view your receipts and take action.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Store</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Product</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Expires</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Days Left</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.APP_BASE_URL}/receipts"
           style="background: #0d6efd; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          View My Receipts
        </a>
      </div>
      <p style="color: #666; font-size: 13px;">
        You are receiving this because you have warranty alerts enabled in your WhereIsIt? Premium account.
        To adjust preferences, visit your
        <a href="${process.env.APP_BASE_URL}/profile">Profile Settings</a>.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #aaa; font-size: 12px; text-align: center;">WhereIsIt? — Keep track of your receipts and warranties</p>
    </div>
  `;

  return await sendAlertEmail(user.email, subject, html);
}

/**
 * Sends an individual email for a single expiring warranty item.
 * Used for the "immediate" frequency setting.
 * Returns the Ethereal preview URL.
 *
 * @param {Object} user
 * @param {Object} item
 * @returns {Promise<string|null>} Ethereal preview URL
 */
async function sendImmediateAlert(user, item) {
  const subject = `WhereIsIt? — Warranty expiring in ${item.daysLeft} days: ${item.productDescription}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0d6efd;">Warranty Expiry Alert</h2>
      <p>Hi ${user.first_name},</p>
      <p>A warranty in your WhereIsIt? account is expiring soon:</p>
      <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 20px; margin: 20px 0;">
        <strong>Product:</strong> ${item.productDescription}<br>
        <strong>Store:</strong> ${item.storeName}<br>
        <strong>Purchased:</strong> ${new Date(item.purchaseDate).toLocaleDateString('en-GB')}<br>
        <strong>Warranty expires:</strong> ${new Date(item.warrantyExpiry).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
        <strong style="color: ${item.daysLeft <= 7 ? '#dc3545' : '#fd7e14'};">
          Days remaining: ${item.daysLeft}
        </strong>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.APP_BASE_URL}/receipts/${item.receiptId}"
           style="background: #0d6efd; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          View Receipt
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #aaa; font-size: 12px; text-align: center;">WhereIsIt? — Keep track of your receipts and warranties</p>
    </div>
  `;

  return await sendAlertEmail(user.email, subject, html);
}

/**
 * Sends a sample test email when the user has no receipts at all.
 * Shows what a real warranty alert would look like.
 * Returns the Ethereal preview URL.
 *
 * @param {Object} user
 * @returns {Promise<string|null>} Ethereal preview URL
 */
async function sendSampleTestEmail(user) {
  const subject = 'WhereIsIt? — Test Warranty Alert (Sample)';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto;">
      <h2 style="color: #0d6efd;">Warranty Expiry Alert — Test Email</h2>
      <p>Hi ${user.first_name},</p>
      <p>This is a <strong>test email</strong> showing what a real warranty alert would look like. You currently have no receipts with warranties expiring within the next 365 days.</p>
      <p>Once you have receipts stored, real alerts will look like this:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Store</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Product</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Expires</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Days Left</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">Example Store</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">Sample Product</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">15 June 2026</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #fd7e14;"><strong>16 days</strong></td>
          </tr>
        </tbody>
      </table>
      <p style="color: #666; font-size: 13px;">
        Your alert preferences are configured in your
        <a href="${process.env.APP_BASE_URL}/profile">Profile Settings</a>.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #aaa; font-size: 12px; text-align: center;">WhereIsIt? — Keep track of your receipts and warranties</p>
    </div>
  `;

  return await sendAlertEmail(user.email, subject, html);
}

/**
 * Sends an email via the shared emailService transport.
 * Logs the Ethereal preview URL to the backend console.
 * Returns the preview URL so callers can surface it further.
 *
 * @param {string} toEmail
 * @param {string} subject
 * @param {string} html
 * @returns {Promise<string|null>} Ethereal preview URL
 */
async function sendAlertEmail(toEmail, subject, html) {
  const transporter = await emailService.getTransporter();

  const info = await transporter.sendMail({
    from: '"WhereIsIt?" <noreply@whereis.it>',
    to: toEmail,
    subject,
    html
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  if (previewUrl) {
    console.log('─────────────────────────────────────────────────────');
    console.log(`   Warranty alert sent to: ${toEmail}`);
    console.log(`    Preview URL: ${previewUrl}`);
    console.log('─────────────────────────────────────────────────────');
  }

  return previewUrl || null;
}

module.exports = { startWarrantyAlertService, runDailyWarrantyCheck, runTestAlertForUser };