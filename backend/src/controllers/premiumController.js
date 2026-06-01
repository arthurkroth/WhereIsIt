/**
 * File: premiumController.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Controller for Premium-exclusive features:
 * - GET  /premium/settings       — fetch alert preferences
 * - PUT  /premium/settings       — update alert preferences
 * - GET  /premium/export/csv     — export receipts to CSV download
 * - POST /premium/alert/test     — trigger a test warranty alert email
 */

const { db } = require('../config/db');
const { EncryptionService } = require('../services/encryptionService');
const { runTestAlertForUser } = require('../services/warrantyAlertService');

const encryption = new EncryptionService();

const VALID_TIMEFRAMES = [7, 14, 30, 60, 90];
const VALID_FREQUENCIES = ['daily', 'weekly', 'immediate'];

/**
 * Middleware: ensures the requesting user has PREMIUM role.
 * Returns 403 if the user is on the Free tier.
 */
function requirePremium(req, res, next) {
  if (req.user.role !== 'PREMIUM' && req.user.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'This feature requires a Premium account.',
      upgradeRequired: true
    });
  }
  next();
}

/**
 * GET /premium/settings
 * Returns the Premium user's warranty alert preferences.
 * If no settings row exists yet, creates one with safe defaults.
 */
async function getSettings(req, res) {
  const userId = req.user.userId;

  const [rows] = await db.execute(
    'SELECT * FROM premium_settings WHERE user_id = ?',
    [userId]
  );

  if (rows.length === 0) {
    // Create default settings row for this user on first access
    await db.execute(
      `INSERT INTO premium_settings (user_id, alerts_enabled, alert_timeframe_days, alert_frequency)
       VALUES (?, TRUE, 30, 'daily')`,
      [userId]
    );

    return res.json({
      success: true,
      settings: {
        alertsEnabled: true,
        alertTimeframeDays: 30,
        alertFrequency: 'daily',
        lastAlertSent: null
      }
    });
  }

  const s = rows[0];
  return res.json({
    success: true,
    settings: {
      alertsEnabled: s.alerts_enabled === 1 || s.alerts_enabled === true,
      alertTimeframeDays: s.alert_timeframe_days,
      alertFrequency: s.alert_frequency,
      lastAlertSent: s.last_alert_sent
    }
  });
}

/**
 * PUT /premium/settings
 * Updates the Premium user's warranty alert preferences.
 * Body: { alertsEnabled, alertTimeframeDays, alertFrequency }
 */
async function updateSettings(req, res) {
  const userId = req.user.userId;
  const { alertsEnabled, alertTimeframeDays, alertFrequency } = req.body;

  // Validate timeframe
  if (alertTimeframeDays !== undefined && !VALID_TIMEFRAMES.includes(parseInt(alertTimeframeDays))) {
    return res.status(400).json({
      error: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(', ')} days`
    });
  }

  // Validate frequency
  if (alertFrequency !== undefined && !VALID_FREQUENCIES.includes(alertFrequency)) {
    return res.status(400).json({
      error: `Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}`
    });
  }

  // Upsert - insert if not exists, update if exists
  await db.execute(
    `INSERT INTO premium_settings (user_id, alerts_enabled, alert_timeframe_days, alert_frequency)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       alerts_enabled = VALUES(alerts_enabled),
       alert_timeframe_days = VALUES(alert_timeframe_days),
       alert_frequency = VALUES(alert_frequency)`,
    [
      userId,
      alertsEnabled !== undefined ? alertsEnabled : true,
      alertTimeframeDays ? parseInt(alertTimeframeDays) : 30,
      alertFrequency || 'daily'
    ]
  );

  try {
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
      [userId, 'PREMIUM_SETTINGS_UPDATED', 'User updated warranty alert preferences']
    );
  } catch (err) {
    console.log('Audit log skipped:', err.message);
  }

  return res.json({ success: true, message: 'Alert preferences saved successfully' });
}

/**
 * GET /premium/export/csv
 * Exports the user's receipts as a downloadable CSV file.
 * Decrypts sensitive fields before formatting.
 * Sets Content-Disposition header to trigger a browser download.
 * Includes a UTF-8 BOM so Excel opens the file correctly.
 */
async function exportCsv(req, res) {
  const userId = req.user.userId;

  const [receipts] = await db.execute(
    `SELECT id, store_name_enc, purchase_date, total_price,
            warranty_months, ocr_confidence, notes_enc, tags, file_path, created_at
     FROM receipts WHERE user_id = ? ORDER BY purchase_date DESC`,
    [userId]
  );

  if (receipts.length === 0) {
    return res.status(404).json({ error: 'No receipts to export' });
  }

  const csvRows = [];

  // Header row
  csvRows.push([
    'Receipt ID', 'Store Name', 'Purchase Date', 'Product(s)',
    'Total Price (€)', 'Warranty (months)', 'Warranty Expiry', 'Warranty Status',
    'Tags', 'Notes', 'Has File', 'OCR Confidence', 'Added On'
  ].map(escapeCsvField).join(','));

  for (const receipt of receipts) {
    try {
      const storeName = encryption.decrypt(receipt.store_name_enc);

      let notes = '';
      if (receipt.notes_enc) {
        try { notes = encryption.decrypt(receipt.notes_enc); } catch { notes = ''; }
      }

      let tags = [];
      try { tags = JSON.parse(receipt.tags || '[]'); } catch { tags = []; }

      // Get all items for this receipt
      const [items] = await db.execute(
        'SELECT product_desc_enc, price FROM receipt_items WHERE receipt_id = ? ORDER BY id ASC',
        [receipt.id]
      );

      const productList = items.map(item => {
        try { return encryption.decrypt(item.product_desc_enc); } catch { return 'Unknown'; }
      }).join(' | ');

      // Calculate warranty expiry and status
      const purchaseDate = new Date(receipt.purchase_date);
      const expiryDate = new Date(purchaseDate);
      expiryDate.setMonth(expiryDate.getMonth() + receipt.warranty_months);
      const expiryStr = expiryDate.toISOString().split('T')[0];

      const now = new Date();
      const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      let status = 'Active';
      if (daysLeft < 0) status = 'Expired';
      else if (daysLeft <= 30) status = 'Expiring Soon';

      csvRows.push([
        receipt.id,
        storeName,
        receipt.purchase_date,
        productList,
        parseFloat(receipt.total_price).toFixed(2),
        receipt.warranty_months,
        expiryStr,
        status,
        tags.join('; '),
        notes,
        receipt.file_path ? 'Yes' : 'No',
        receipt.ocr_confidence || 'manual',
        new Date(receipt.created_at).toISOString().split('T')[0]
      ].map(escapeCsvField).join(','));

    } catch (err) {
      console.error('Error processing receipt for CSV:', receipt.id, err.message);
    }
  }

  // Log the export action
  try {
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
      [userId, 'RECEIPT_CSV_EXPORTED', `Exported ${receipts.length} receipts to CSV`]
    );
  } catch (err) {
    console.log('Audit log skipped:', err.message);
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `WhereIsIt_Receipts_${dateStr}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // UTF-8 BOM for Excel compatibility
  return res.send('\uFEFF' + csvRows.join('\n'));
}

/**
 * POST /premium/alert/test
 * Sends a real test warranty alert email to the current user.
 *
 * Uses a 365-day window to guarantee findings even if no warranties
 * are expiring within the user's configured timeframe.
 * If the user has no receipts at all, sends a sample email.
 *
 * Returns the Ethereal preview URL in the response so it can be
 * displayed directly in the browser without needing to check the console.
 */
async function sendTestAlert(req, res) {
  const userId = req.user.userId;

  try {
    // This actually sends the email — previous version forgot to call it!
    const result = await runTestAlertForUser(userId);

    const message = result.sample
      ? 'Sample test email sent (you have no receipts with active warranties). Check the link below to preview it.'
      : `Test alert sent for ${result.itemCount} receipt(s). Check the link below to preview it.`;

    return res.json({
      success: true,
      message,
      previewUrl: result.previewUrl  // Ethereal URL — open this in the browser to see the email
    });

  } catch (err) {
    console.error('Test alert error:', err.message);
    return res.status(500).json({ error: 'Failed to send test alert: ' + err.message });
  }
}

/**
 * Escapes a value for safe inclusion in a CSV field.
 * Wraps in double quotes and escapes internal quotes.
 *
 * @param {*} value
 * @returns {string} CSV-safe string
 */
function escapeCsvField(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

module.exports = { requirePremium, getSettings, updateSettings, exportCsv, sendTestAlert };