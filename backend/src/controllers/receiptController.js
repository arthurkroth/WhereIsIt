/**
 * Receipt Controller with OCR Integration, Multi-Item Support, Notes, and Tags.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { OcrService } = require('../services/ocrService');
const { EncryptionService } = require('../services/encryptionService');
const { db } = require('../config/db');
const path = require('path');
const fs = require('fs').promises;

const ocrService = new OcrService();
const encryption = new EncryptionService();

// Maximum number of receipts allowed for FREE tier users
const FREE_TIER_LIMIT = 10;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculates the warranty expiry date from a purchase date and duration.
 * @param {string} purchaseDate - YYYY-MM-DD
 * @param {number} warrantyMonths
 * @returns {string} Expiry date in YYYY-MM-DD
 */
function calculateWarrantyExpiry(purchaseDate, warrantyMonths) {
  const purchase = new Date(purchaseDate);
  const expiry = new Date(purchase);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);
  return expiry.toISOString().split('T')[0];
}

/**
 * Determines warranty status.
 * @param {string} purchaseDate
 * @param {number} warrantyMonths
 * @returns {string} 'active', 'expiring_soon', or 'expired'
 */
function getWarrantyStatus(purchaseDate, warrantyMonths) {
  const now = new Date();
  const expiry = new Date(purchaseDate);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);

  if (now > expiry) return 'expired';

  const daysLeft = (expiry - now) / (1000 * 60 * 60 * 24);
  if (daysLeft <= 30) return 'expiring_soon';

  return 'active';
}

/**
 * Inserts an array of items into the receipt_items table.
 * Each product description is encrypted before storage.
 * @param {number} receiptId
 * @param {Array} items - [{productDescription, price, warrantyMonths}]
 */
async function insertReceiptItems(receiptId, items) {
  for (const item of items) {
    const encryptedProduct = encryption.encrypt(item.productDescription);
    await db.execute(
      `INSERT INTO receipt_items (receipt_id, product_desc_enc, price, warranty_months)
       VALUES (?, ?, ?, ?)`,
      [receiptId, encryptedProduct, parseFloat(item.price) || 0, parseInt(item.warrantyMonths) || 12]
    );
  }
}

/**
 * Fetches and decrypts all items for a given receipt ID.
 * @param {number} receiptId
 * @returns {Promise<Array>}
 */
async function getReceiptItems(receiptId) {
  const [rows] = await db.execute(
    `SELECT id, product_desc_enc, price, warranty_months, created_at
     FROM receipt_items WHERE receipt_id = ? ORDER BY id ASC`,
    [receiptId]
  );

  return rows.map(item => {
    try {
      return {
        id: item.id,
        productDescription: encryption.decrypt(item.product_desc_enc),
        price: item.price,
        warrantyMonths: item.warranty_months,
        createdAt: item.created_at
      };
    } catch (err) {
      console.error('Decryption error for item', item.id, ':', err);
      return null;
    }
  }).filter(item => item !== null);
}

/**
 * Checks whether the user has reached their storage limit.
 * Only enforced for FREE tier users (limit: FREE_TIER_LIMIT receipts).
 * @param {number} userId
 * @param {string} role - User's role from JWT
 * @returns {Promise<{limitReached: boolean, count: number}>}
 */
async function checkStorageLimit(userId, role) {
  if (role !== 'FREE') return { limitReached: false, count: 0 };

  const [countResult] = await db.execute(
    'SELECT COUNT(*) as count FROM receipts WHERE user_id = ?',
    [userId]
  );
  const count = countResult[0].count;
  return { limitReached: count >= FREE_TIER_LIMIT, count };
}

// ============================================================================
// ENDPOINT HANDLERS
// ============================================================================

/**
 * POST /receipts/upload
 * Handles receipt file upload and OCR processing.
 * Enforces storage limits for FREE tier users before processing.
 */
async function uploadReceipt(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.userId;
    const userRole = req.user.role;
    const file = req.file;

    // Check storage limit before processing — saves time and disk space
    const { limitReached, count } = await checkStorageLimit(userId, userRole);
    if (limitReached) {
      await fs.unlink(file.path).catch(() => {});
      return res.status(403).json({
        error: `Free tier limit reached. You have ${count}/${FREE_TIER_LIMIT} receipts. Upgrade to Premium for unlimited storage.`,
        limitReached: true,
        upgradeRequired: true
      });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      await fs.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, and PDF files are allowed.' });
    }

    if (file.size > 10 * 1024 * 1024) {
      await fs.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }

    const ocrResult = await ocrService.processReceipt(file.path, file.mimetype);

    if (!ocrResult.success) {
      console.error('OCR processing failed:', ocrResult.error);
    }

    const extractedData = ocrService.validateExtractedData(ocrResult.extractedData);
    const encryptedStoreName = encryption.encrypt(extractedData.storeName);

    const [result] = await db.execute(
      `INSERT INTO receipts
       (user_id, file_path, store_name_enc, purchase_date, total_price, warranty_months, ocr_confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, file.filename, encryptedStoreName, extractedData.purchaseDate,
       extractedData.totalPrice, extractedData.warrantyMonths, extractedData.confidence]
    );

    const receiptId = result.insertId;
    await insertReceiptItems(receiptId, extractedData.items);

    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_UPLOADED", `Receipt ${receiptId} uploaded. OCR confidence: ${extractedData.confidence}`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({
      success: true,
      receiptId,
      message: 'Receipt uploaded and processed successfully',
      extractedData: {
        storeName: extractedData.storeName,
        purchaseDate: extractedData.purchaseDate,
        items: extractedData.items,
        totalPrice: extractedData.totalPrice,
        warrantyMonths: extractedData.warrantyMonths,
        confidence: extractedData.confidence,
        notes: '',
        tags: []
      },
      ocrSuccess: ocrResult.success,
      canEdit: true
    });

  } catch (error) {
    console.error('Receipt upload error:', error);
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    return res.status(500).json({ error: 'Failed to process receipt', details: error.message });
  }
}

/**
 * POST /receipts/manual
 * Creates a receipt from manually entered data.
 * Enforces storage limits for FREE tier users.
 * Accepts notes (free text, encrypted) and tags (JSON array, plain).
 */
async function createManualReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { storeName, purchaseDate, totalPrice, warrantyMonths, items, notes, tags } = req.body;

    // Check storage limit
    const { limitReached, count } = await checkStorageLimit(userId, userRole);
    if (limitReached) {
      return res.status(403).json({
        error: `Free tier limit reached. You have ${count}/${FREE_TIER_LIMIT} receipts. Upgrade to Premium for unlimited storage.`,
        limitReached: true,
        upgradeRequired: true
      });
    }

    if (!storeName || !purchaseDate) {
      return res.status(400).json({ error: 'Missing required fields: storeName and purchaseDate' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const encryptedStoreName = encryption.encrypt(storeName);

    // Encrypt notes if provided (they may contain sensitive purchase details)
    const encryptedNotes = notes && notes.trim()
      ? encryption.encrypt(notes.trim().substring(0, 1000))
      : null;

    // Tags are stored as a JSON array string — not sensitive so not encrypted
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : '[]';

    const [result] = await db.execute(
      `INSERT INTO receipts
       (user_id, file_path, store_name_enc, purchase_date, total_price, warranty_months,
        ocr_confidence, notes_enc, tags, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, 'manual', ?, ?, NOW())`,
      [userId, encryptedStoreName, purchaseDate, parseFloat(totalPrice) || 0,
       parseInt(warrantyMonths) || 12, encryptedNotes, tagsJson]
    );

    const receiptId = result.insertId;
    await insertReceiptItems(receiptId, items);

    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_MANUAL_ENTRY", `Manual receipt ${receiptId} created with ${items.length} item(s)`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({ success: true, receiptId, message: 'Receipt created successfully' });

  } catch (error) {
    console.error('Manual receipt creation error:', error);
    return res.status(500).json({ error: 'Failed to create receipt' });
  }
}

/**
 * GET /receipts
 * Retrieves all receipts for the authenticated user.
 * Decrypts sensitive fields and parses tags for display.
 * Also returns storage usage info for FREE tier users.
 */
async function listReceipts(req, res) {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    const [rows] = await db.execute(
      `SELECT id, file_path, store_name_enc, purchase_date, total_price,
              warranty_months, ocr_confidence, notes_enc, tags, created_at
       FROM receipts WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    const receipts = await Promise.all(
      rows.map(async (receipt) => {
        try {
          const items = await getReceiptItems(receipt.id);

          // Safely decrypt notes — returns null if no notes stored
          let notes = null;
          if (receipt.notes_enc) {
            try { notes = encryption.decrypt(receipt.notes_enc); } catch { notes = null; }
          }

          // Safely parse tags JSON array
          let tags = [];
          try { tags = JSON.parse(receipt.tags || '[]'); } catch { tags = []; }

          return {
            id: receipt.id,
            storeName: encryption.decrypt(receipt.store_name_enc),
            purchaseDate: receipt.purchase_date,
            totalPrice: receipt.total_price,
            warrantyMonths: receipt.warranty_months,
            warrantyExpiry: calculateWarrantyExpiry(receipt.purchase_date, receipt.warranty_months),
            warrantyStatus: getWarrantyStatus(receipt.purchase_date, receipt.warranty_months),
            ocrConfidence: receipt.ocr_confidence,
            hasFile: receipt.file_path !== null,
            itemCount: items.length,
            firstItemDescription: items.length > 0 ? items[0].productDescription : 'No items',
            items,
            notes,
            tags,
            createdAt: receipt.created_at
          };
        } catch (err) {
          console.error('Error processing receipt', receipt.id, ':', err);
          return null;
        }
      })
    );

    const validReceipts = receipts.filter(r => r !== null);

    // Build storage info for FREE tier users
    const storageInfo = userRole === 'FREE'
      ? { used: validReceipts.length, limit: FREE_TIER_LIMIT, isLimited: true }
      : { used: validReceipts.length, limit: null, isLimited: false };

    return res.json({
      success: true,
      receipts: validReceipts,
      totalCount: validReceipts.length,
      storageInfo
    });

  } catch (error) {
    console.error('List receipts error:', error);
    return res.status(500).json({ error: 'Failed to retrieve receipts' });
  }
}

/**
 * GET /receipts/:id
 * Returns a single receipt with all its items, notes, and tags.
 */
async function getReceiptById(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;

    const [rows] = await db.execute(
      `SELECT id, file_path, store_name_enc, purchase_date, total_price,
              warranty_months, ocr_confidence, notes_enc, tags, created_at
       FROM receipts WHERE id = ? AND user_id = ?`,
      [receiptId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const receipt = rows[0];
    const items = await getReceiptItems(receipt.id);

    let notes = null;
    if (receipt.notes_enc) {
      try { notes = encryption.decrypt(receipt.notes_enc); } catch { notes = null; }
    }

    let tags = [];
    try { tags = JSON.parse(receipt.tags || '[]'); } catch { tags = []; }

    const decrypted = {
      id: receipt.id,
      storeName: encryption.decrypt(receipt.store_name_enc),
      purchaseDate: receipt.purchase_date,
      totalPrice: receipt.total_price,
      warrantyMonths: receipt.warranty_months,
      warrantyExpiry: calculateWarrantyExpiry(receipt.purchase_date, receipt.warranty_months),
      warrantyStatus: getWarrantyStatus(receipt.purchase_date, receipt.warranty_months),
      ocrConfidence: receipt.ocr_confidence,
      hasFile: receipt.file_path !== null,
      fileName: receipt.file_path,
      items,
      itemCount: items.length,
      notes,
      tags,
      createdAt: receipt.created_at
    };

    return res.json({ success: true, receipt: decrypted });

  } catch (error) {
    console.error('Get receipt error:', error);
    return res.status(500).json({ error: 'Failed to retrieve receipt' });
  }
}

/**
 * PUT /receipts/:id
 * Updates a receipt header, items, notes, and tags.
 * Deletes and re-inserts items for simplicity.
 */
async function updateReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;
    const { storeName, purchaseDate, totalPrice, warrantyMonths, items, notes, tags } = req.body;

    const [existing] = await db.execute(
      'SELECT id FROM receipts WHERE id = ? AND user_id = ?',
      [receiptId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const encryptedStoreName = encryption.encrypt(storeName);

    const encryptedNotes = notes && notes.trim()
      ? encryption.encrypt(notes.trim().substring(0, 1000))
      : null;

    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : '[]';

    await db.execute(
      `UPDATE receipts SET store_name_enc = ?, purchase_date = ?, total_price = ?,
       warranty_months = ?, notes_enc = ?, tags = ? WHERE id = ? AND user_id = ?`,
      [encryptedStoreName, purchaseDate, parseFloat(totalPrice) || 0,
       parseInt(warrantyMonths) || 12, encryptedNotes, tagsJson, receiptId, userId]
    );

    if (items && Array.isArray(items) && items.length > 0) {
      await db.execute('DELETE FROM receipt_items WHERE receipt_id = ?', [receiptId]);
      await insertReceiptItems(receiptId, items);
    }

    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_UPDATED", `Receipt ${receiptId} updated`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({ success: true, message: 'Receipt updated successfully' });

  } catch (error) {
    console.error('Update receipt error:', error);
    return res.status(500).json({ error: 'Failed to update receipt' });
  }
}

/**
 * DELETE /receipts/:id
 * Deletes a receipt, all its items (via CASCADE), and its uploaded file.
 */
async function deleteReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;

    const [rows] = await db.execute(
      'SELECT file_path FROM receipts WHERE id = ? AND user_id = ?',
      [receiptId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const filePath = rows[0].file_path;

    await db.execute('DELETE FROM receipts WHERE id = ? AND user_id = ?', [receiptId, userId]);

    if (filePath) {
      const fullPath = path.join(__dirname, '../../uploads', filePath);
      await fs.unlink(fullPath).catch(() => {
        console.log('File not found or already deleted:', filePath);
      });
    }

    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_DELETED", `Receipt ${receiptId} deleted`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({ success: true, message: 'Receipt deleted successfully' });

  } catch (error) {
    console.error('Delete receipt error:', error);
    return res.status(500).json({ error: 'Failed to delete receipt' });
  }
}

/**
 * GET /receipts/:id/file
 * Serves the uploaded receipt file securely.
 */
async function getReceiptFile(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;

    const [rows] = await db.execute(
      'SELECT file_path FROM receipts WHERE id = ? AND user_id = ?',
      [receiptId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const fileName = rows[0].file_path;

    if (!fileName) {
      return res.status(404).json({ error: 'No file attached to this receipt' });
    }

    const fullPath = path.join(__dirname, '../../uploads', fileName);

    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }

    return res.sendFile(fullPath);

  } catch (error) {
    console.error('Get receipt file error:', error);
    return res.status(500).json({ error: 'Failed to retrieve file' });
  }
}

module.exports = {
  uploadReceipt,
  createManualReceipt,
  listReceipts,
  getReceiptById,
  getReceiptFile,
  updateReceipt,
  deleteReceipt
};