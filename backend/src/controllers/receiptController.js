/**
 * Receipt Controller with OCR Integration, Multi-Item Support, Notes, and Tags.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * KEY CHANGES:
 * - uploadReceipt passes req.user.role to ocrService so Premium → OpenAI, Free → Tesseract
 * - uploadReceipt returns aiProviderError and aiProviderMessage when OpenAI falls back to Tesseract
 * - Storage limit only enforced for FREE role (Premium = unlimited)
 * - listReceipts returns fileType ('pdf'|'image'|null) for advanced frontend filters
 */

const { OcrService } = require('../services/ocrService');
const { EncryptionService } = require('../services/encryptionService');
const { db } = require('../config/db');
const path = require('path');
const fs = require('fs').promises;

const ocrService = new OcrService();
const encryption = new EncryptionService();

const FREE_TIER_LIMIT = 10;

// ============================================================================
// HELPERS
// ============================================================================

function calculateWarrantyExpiry(purchaseDate, warrantyMonths) {
  const purchase = new Date(purchaseDate);
  const expiry = new Date(purchase);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);
  return expiry.toISOString().split('T')[0];
}

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
 * Derives the file type from a stored filename.
 * Returns 'pdf', 'image', or null (for manual entries with no file).
 */
function getFileType(filePath) {
  if (!filePath) return null;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png'].includes(ext)) return 'image';
  return null;
}

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
    } catch { return null; }
  }).filter(Boolean);
}

/**
 * Checks storage limit — only enforced for FREE tier.
 * Premium users always pass this check.
 */
async function checkStorageLimit(userId, role) {
  if (role !== 'FREE') return { limitReached: false, count: 0 };
  const [countResult] = await db.execute(
    'SELECT COUNT(*) as count FROM receipts WHERE user_id = ?', [userId]
  );
  const count = countResult[0].count;
  return { limitReached: count >= FREE_TIER_LIMIT, count };
}

// ============================================================================
// UPLOAD RECEIPT
// ============================================================================

/**
 * POST /receipts/upload
 * Handles file upload and OCR processing.
 * Routes to OpenAI (Premium) or Tesseract (Free) based on user role.
 * If OpenAI fails, ocrService automatically falls back to Tesseract and
 * sets aiProviderError = true on the result — this is surfaced to the frontend
 * so the user is notified that AI OCR was unavailable.
 */
async function uploadReceipt(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const userId = req.user.userId;
    const userRole = req.user.role;
    const file = req.file;

    const { limitReached, count } = await checkStorageLimit(userId, userRole);
    if (limitReached) {
      await fs.unlink(file.path).catch(() => {});
      return res.status(403).json({
        error: `Free tier limit reached. You have ${count}/${FREE_TIER_LIMIT} receipts. Upgrade to Premium for unlimited storage.`,
        limitReached: true, upgradeRequired: true
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

    // Pass userRole so the service routes to OpenAI or Tesseract accordingly.
    // If OpenAI fails, the service falls back to Tesseract and sets aiProviderError.
    const ocrResult = await ocrService.processReceipt(file.path, file.mimetype, userRole);
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

    // Determine which OCR method was actually used
    const usedOpenAI = userRole === 'PREMIUM' && !ocrResult.aiProviderError;

    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, 'RECEIPT_UPLOADED',
         `Receipt ${receiptId} uploaded via ${usedOpenAI ? 'OpenAI' : 'Tesseract'} OCR. Confidence: ${extractedData.confidence}`]
      );
    } catch (err) { console.log('Audit log skipped:', err.message); }

    return res.json({
      success: true,
      receiptId,
      message: `Receipt uploaded and processed successfully${usedOpenAI ? ' (AI-enhanced)' : ''}`,
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
      ocrMethod: usedOpenAI ? 'openai' : 'tesseract',
      // These two fields notify the frontend when OpenAI fell back to Tesseract
      aiProviderError: ocrResult.aiProviderError || false,
      aiProviderMessage: ocrResult.aiProviderMessage || null,
      canEdit: true
    });

  } catch (error) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    return res.status(500).json({ error: 'Failed to process receipt', details: error.message });
  }
}

// ============================================================================
// MANUAL RECEIPT
// ============================================================================

/**
 * POST /receipts/manual
 * Creates a receipt from manually entered data.
 * Storage limit only applies to FREE tier.
 */
async function createManualReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { storeName, purchaseDate, totalPrice, warrantyMonths, items, notes, tags } = req.body;

    const { limitReached, count } = await checkStorageLimit(userId, userRole);
    if (limitReached) {
      return res.status(403).json({
        error: `Free tier limit reached. You have ${count}/${FREE_TIER_LIMIT} receipts.`,
        limitReached: true, upgradeRequired: true
      });
    }

    if (!storeName || !purchaseDate) return res.status(400).json({ error: 'Missing required fields' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const encryptedStoreName = encryption.encrypt(storeName);
    const encryptedNotes = notes?.trim() ? encryption.encrypt(notes.trim().substring(0, 1000)) : null;
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : '[]';

    const [result] = await db.execute(
      `INSERT INTO receipts (user_id, file_path, store_name_enc, purchase_date, total_price,
       warranty_months, ocr_confidence, notes_enc, tags, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, 'manual', ?, ?, NOW())`,
      [userId, encryptedStoreName, purchaseDate, parseFloat(totalPrice) || 0,
       parseInt(warrantyMonths) || 12, encryptedNotes, tagsJson]
    );

    const receiptId = result.insertId;
    await insertReceiptItems(receiptId, items);

    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, 'RECEIPT_MANUAL_ENTRY', `Manual receipt ${receiptId} created with ${items.length} item(s)`]
      );
    } catch (err) { console.log('Audit log skipped:', err.message); }

    return res.json({ success: true, receiptId, message: 'Receipt created successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create receipt' });
  }
}

// ============================================================================
// LIST RECEIPTS
// ============================================================================

/**
 * GET /receipts
 * Returns all receipts for the authenticated user.
 * Includes fileType ('pdf'|'image'|null) for advanced frontend filtering.
 * For Premium users, storageInfo shows unlimited status.
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

    const receipts = await Promise.all(rows.map(async (receipt) => {
      try {
        const items = await getReceiptItems(receipt.id);
        let notes = null;
        if (receipt.notes_enc) { try { notes = encryption.decrypt(receipt.notes_enc); } catch {} }
        let tags = [];
        try { tags = JSON.parse(receipt.tags || '[]'); } catch {}

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
          fileType: getFileType(receipt.file_path),
          itemCount: items.length,
          firstItemDescription: items.length > 0 ? items[0].productDescription : 'No items',
          items, notes, tags,
          createdAt: receipt.created_at
        };
      } catch { return null; }
    }));

    const validReceipts = receipts.filter(Boolean);

    const storageInfo = userRole === 'FREE'
      ? { used: validReceipts.length, limit: FREE_TIER_LIMIT, isLimited: true }
      : { used: validReceipts.length, limit: null, isLimited: false, unlimited: true };

    return res.json({ success: true, receipts: validReceipts, totalCount: validReceipts.length, storageInfo });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve receipts' });
  }
}

// ============================================================================
// GET / UPDATE / DELETE SINGLE RECEIPT
// ============================================================================

async function getReceiptById(req, res) {
  try {
    const userId = req.user.userId;
    const [rows] = await db.execute(
      `SELECT id, file_path, store_name_enc, purchase_date, total_price,
              warranty_months, ocr_confidence, notes_enc, tags, created_at
       FROM receipts WHERE id = ? AND user_id = ?`,
      [req.params.id, userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Receipt not found' });

    const receipt = rows[0];
    const items = await getReceiptItems(receipt.id);
    let notes = null;
    if (receipt.notes_enc) { try { notes = encryption.decrypt(receipt.notes_enc); } catch {} }
    let tags = [];
    try { tags = JSON.parse(receipt.tags || '[]'); } catch {}

    return res.json({
      success: true,
      receipt: {
        id: receipt.id,
        storeName: encryption.decrypt(receipt.store_name_enc),
        purchaseDate: receipt.purchase_date,
        totalPrice: receipt.total_price,
        warrantyMonths: receipt.warranty_months,
        warrantyExpiry: calculateWarrantyExpiry(receipt.purchase_date, receipt.warranty_months),
        warrantyStatus: getWarrantyStatus(receipt.purchase_date, receipt.warranty_months),
        ocrConfidence: receipt.ocr_confidence,
        hasFile: receipt.file_path !== null,
        fileType: getFileType(receipt.file_path),
        fileName: receipt.file_path,
        items, itemCount: items.length, notes, tags,
        createdAt: receipt.created_at
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve receipt' });
  }
}

async function updateReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const { storeName, purchaseDate, totalPrice, warrantyMonths, items, notes, tags } = req.body;

    const [existing] = await db.execute(
      'SELECT id FROM receipts WHERE id = ? AND user_id = ?', [req.params.id, userId]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Receipt not found' });

    const encryptedNotes = notes?.trim() ? encryption.encrypt(notes.trim().substring(0, 1000)) : null;
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : '[]';

    await db.execute(
      `UPDATE receipts SET store_name_enc = ?, purchase_date = ?, total_price = ?,
       warranty_months = ?, notes_enc = ?, tags = ? WHERE id = ? AND user_id = ?`,
      [encryption.encrypt(storeName), purchaseDate, parseFloat(totalPrice) || 0,
       parseInt(warrantyMonths) || 12, encryptedNotes, tagsJson, req.params.id, userId]
    );

    if (items?.length > 0) {
      await db.execute('DELETE FROM receipt_items WHERE receipt_id = ?', [req.params.id]);
      await insertReceiptItems(req.params.id, items);
    }

    try {
      await db.execute("INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, 'RECEIPT_UPDATED', `Receipt ${req.params.id} updated`]);
    } catch {}

    return res.json({ success: true, message: 'Receipt updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update receipt' });
  }
}

async function deleteReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const [rows] = await db.execute(
      'SELECT file_path FROM receipts WHERE id = ? AND user_id = ?', [req.params.id, userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Receipt not found' });

    await db.execute('DELETE FROM receipts WHERE id = ? AND user_id = ?', [req.params.id, userId]);

    if (rows[0].file_path) {
      await fs.unlink(path.join(__dirname, '../../uploads', rows[0].file_path)).catch(() => {});
    }

    try {
      await db.execute("INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, 'RECEIPT_DELETED', `Receipt ${req.params.id} deleted`]);
    } catch {}

    return res.json({ success: true, message: 'Receipt deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete receipt' });
  }
}

async function getReceiptFile(req, res) {
  try {
    const userId = req.user.userId;
    const [rows] = await db.execute(
      'SELECT file_path FROM receipts WHERE id = ? AND user_id = ?', [req.params.id, userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Receipt not found' });
    if (!rows[0].file_path) return res.status(404).json({ error: 'No file attached' });

    const fullPath = path.join(__dirname, '../../uploads', rows[0].file_path);
    try { await fs.access(fullPath); } catch { return res.status(404).json({ error: 'File not found' }); }

    return res.sendFile(fullPath);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve file' });
  }
}

module.exports = {
  uploadReceipt, createManualReceipt, listReceipts,
  getReceiptById, getReceiptFile, updateReceipt, deleteReceipt
};