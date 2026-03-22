/**
 * Receipt Controller with OCR Integration and Multi-Item Support.
 * Handles receipt upload, OCR processing, item storage, and data retrieval.
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculates the warranty expiry date from a purchase date and duration.
 *
 * @param {string} purchaseDate - Purchase date in YYYY-MM-DD format
 * @param {number} warrantyMonths - Warranty duration in months
 * @returns {string} Expiry date in YYYY-MM-DD format
 */
function calculateWarrantyExpiry(purchaseDate, warrantyMonths) {
  const purchase = new Date(purchaseDate);
  const expiry = new Date(purchase);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);
  return expiry.toISOString().split('T')[0];
}

/**
 * Determines warranty status based on purchase date and duration.
 *
 * @param {string} purchaseDate - Purchase date in YYYY-MM-DD format
 * @param {number} warrantyMonths - Warranty duration in months
 * @returns {string} Status: 'active', 'expiring_soon', or 'expired'
 */
function getWarrantyStatus(purchaseDate, warrantyMonths) {
  const now = new Date();
  const expiry = new Date(purchaseDate);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);

  if (now > expiry) {
    return 'expired';
  }

  // Expiring soon if less than 30 days left
  const daysLeft = (expiry - now) / (1000 * 60 * 60 * 24);
  if (daysLeft <= 30) {
    return 'expiring_soon';
  }

  return 'active';
}

/**
 * Inserts an array of items into the receipt_items table for a given receipt.
 * Each item's product description is encrypted before storage.
 *
 * @param {number} receiptId - The ID of the parent receipt
 * @param {Array} items - Array of {productDescription, price, warrantyMonths}
 * @returns {Promise<void>}
 */
async function insertReceiptItems(receiptId, items) {
  for (const item of items) {
    const encryptedProduct = encryption.encrypt(item.productDescription);
    await db.execute(
      `INSERT INTO receipt_items (receipt_id, product_desc_enc, price, warranty_months)
       VALUES (?, ?, ?, ?)`,
      [
        receiptId,
        encryptedProduct,
        parseFloat(item.price) || 0,
        parseInt(item.warrantyMonths) || 12
      ]
    );
  }
}

/**
 * Fetches and decrypts all items for a given receipt ID.
 *
 * @param {number} receiptId - The receipt ID to fetch items for
 * @returns {Promise<Array>} Array of decrypted item objects
 */
async function getReceiptItems(receiptId) {
  const [rows] = await db.execute(
    `SELECT id, product_desc_enc, price, warranty_months, created_at
     FROM receipt_items
     WHERE receipt_id = ?
     ORDER BY id ASC`,
    [receiptId]
  );

  return rows.map(item => {
    try {
      return {
        id: item.id,
        productDescription: encryption.decrypt(item.product_desc_enc),
        price: item.price,
        warrantyMonths: item.warranty_months,
        warrantyExpiry: calculateWarrantyExpiry(null, item.warranty_months),
        createdAt: item.created_at
      };
    } catch (err) {
      console.error('Decryption error for item', item.id, ':', err);
      return null;
    }
  }).filter(item => item !== null);
}

// ============================================================================
// ENDPOINT HANDLERS
// ============================================================================

/**
 * POST /receipts/upload
 * Handles receipt file upload and OCR processing.
 *
 * WORKFLOW:
 * 1. Receive and validate the uploaded file
 * 2. Run OCR to extract text from the file
 * 3. Parse the text to find structured data (store, date, items, total)
 * 4. Encrypt sensitive fields (store name, product descriptions)
 * 5. Insert the receipt header row into the receipts table
 * 6. Insert each extracted item into the receipt_items table
 * 7. Return extracted data to frontend for user review and confirmation
 *
 * SECURITY:
 * - File type validation (server-side)
 * - File size limit enforcement
 * - Encryption of all sensitive fields before DB storage
 * - Randomised file names (handled by multer in receiptRoutes.js)
 */
async function uploadReceipt(req, res) {
  try {
    console.log('Receipt upload request received');

    // Check if a file was actually uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.userId;
    const file = req.file;

    console.log('Processing file:', file.originalname, 'Type:', file.mimetype, 'Size:', file.size);

    // Validate file type as a security measure (server-side check)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      await fs.unlink(file.path).catch(() => {});
      return res.status(400).json({
        error: 'Invalid file type. Only JPEG, PNG, and PDF files are allowed.'
      });
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      await fs.unlink(file.path).catch(() => {});
      return res.status(400).json({
        error: 'File too large. Maximum size is 10MB.'
      });
    }

    // Run OCR to extract text from the uploaded file
    console.log('Starting OCR processing...');
    const ocrResult = await ocrService.processReceipt(file.path, file.mimetype);

    if (!ocrResult.success) {
      console.error('OCR processing failed:', ocrResult.error);
      // We still continue - the user can fill in the data manually during review
    }

    // Validate and sanitise the extracted data
    const extractedData = ocrService.validateExtractedData(ocrResult.extractedData);

    console.log('OCR completed. Extracted data:', extractedData);

    // Encrypt the store name before storing in the database
    const encryptedStoreName = encryption.encrypt(extractedData.storeName);

    // Insert the receipt header row (no product description - that lives in receipt_items)
    const [result] = await db.execute(
      `INSERT INTO receipts
       (user_id, file_path, store_name_enc, purchase_date, total_price,
        warranty_months, ocr_confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        file.filename,               // Randomised filename from multer
        encryptedStoreName,
        extractedData.purchaseDate,
        extractedData.totalPrice,
        extractedData.warrantyMonths,
        extractedData.confidence
      ]
    );

    const receiptId = result.insertId;

    // Insert all extracted line items into the receipt_items table
    await insertReceiptItems(receiptId, extractedData.items);

    // Log the upload action to the audit log
    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_UPLOADED", `Receipt ${receiptId} uploaded. OCR confidence: ${extractedData.confidence}. Items extracted: ${extractedData.items.length}`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    // Return all extracted data to the frontend for the user review step
    return res.json({
      success: true,
      receiptId: receiptId,
      message: 'Receipt uploaded and processed successfully',
      extractedData: {
        storeName: extractedData.storeName,
        purchaseDate: extractedData.purchaseDate,
        items: extractedData.items,
        totalPrice: extractedData.totalPrice,
        warrantyMonths: extractedData.warrantyMonths,
        confidence: extractedData.confidence
      },
      ocrSuccess: ocrResult.success,
      canEdit: true
    });

  } catch (error) {
    console.error('Receipt upload error:', error);

    // Clean up the uploaded file if something went wrong
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    return res.status(500).json({
      error: 'Failed to process receipt',
      details: error.message
    });
  }
}

/**
 * POST /receipts/manual
 * Creates a receipt from manually entered data (no file upload).
 * Accepts an array of items so multi-item receipts can be entered manually too.
 *
 * Expected body:
 * {
 *   storeName: string,
 *   purchaseDate: string (YYYY-MM-DD),
 *   totalPrice: number,
 *   warrantyMonths: number,
 *   items: [{ productDescription, price, warrantyMonths }]
 * }
 */
async function createManualReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const { storeName, purchaseDate, totalPrice, warrantyMonths, items } = req.body;

    // Validate required top-level fields
    if (!storeName || !purchaseDate) {
      return res.status(400).json({ error: 'Missing required fields: storeName and purchaseDate' });
    }

    // Validate that at least one item was provided
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // Encrypt the store name
    const encryptedStoreName = encryption.encrypt(storeName);

    // Insert the receipt header row
    const [result] = await db.execute(
      `INSERT INTO receipts
       (user_id, file_path, store_name_enc, purchase_date, total_price,
        warranty_months, ocr_confidence, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, 'manual', NOW())`,
      [
        userId,
        encryptedStoreName,
        purchaseDate,
        parseFloat(totalPrice) || 0,
        parseInt(warrantyMonths) || 12
      ]
    );

    const receiptId = result.insertId;

    // Insert all items into the receipt_items table
    await insertReceiptItems(receiptId, items);

    // Log the manual entry action
    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_MANUAL_ENTRY", `Manual receipt ${receiptId} created with ${items.length} item(s)`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({
      success: true,
      receiptId: receiptId,
      message: 'Receipt created successfully'
    });

  } catch (error) {
    console.error('Manual receipt creation error:', error);
    return res.status(500).json({ error: 'Failed to create receipt' });
  }
}

/**
 * GET /receipts
 * Retrieves all receipts for the authenticated user.
 * For each receipt, also fetches the associated items from receipt_items.
 * Returns decrypted data ready for display in the frontend.
 */
async function listReceipts(req, res) {
  try {
    const userId = req.user.userId;

    // Fetch all receipt headers for this user
    const [rows] = await db.execute(
      `SELECT id, file_path, store_name_enc, purchase_date, total_price,
              warranty_months, ocr_confidence, created_at
       FROM receipts
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    // For each receipt, decrypt the header fields and fetch its items
    const receipts = await Promise.all(
      rows.map(async (receipt) => {
        try {
          // Fetch all items for this receipt
          const items = await getReceiptItems(receipt.id);

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
            // Include first item's description as a summary for the list view
            firstItemDescription: items.length > 0 ? items[0].productDescription : 'No items',
            items: items,
            createdAt: receipt.created_at
          };
        } catch (err) {
          console.error('Error processing receipt', receipt.id, ':', err);
          return null;
        }
      })
    );

    // Filter out any receipts that failed to process
    const validReceipts = receipts.filter(r => r !== null);

    return res.json({
      success: true,
      receipts: validReceipts,
      totalCount: validReceipts.length
    });

  } catch (error) {
    console.error('List receipts error:', error);
    return res.status(500).json({ error: 'Failed to retrieve receipts' });
  }
}

/**
 * GET /receipts/:id
 * Returns a single receipt with all its items for the authenticated user.
 * Security: only returns the receipt if it belongs to the requesting user.
 */
async function getReceiptById(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;

    // Fetch the receipt header - WHERE clause enforces ownership
    const [rows] = await db.execute(
      `SELECT id, file_path, store_name_enc, purchase_date, total_price,
              warranty_months, ocr_confidence, created_at
       FROM receipts
       WHERE id = ? AND user_id = ?`,
      [receiptId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const receipt = rows[0];

    // Fetch all items for this receipt
    const items = await getReceiptItems(receipt.id);

    // Build the full decrypted receipt object
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
      items: items,
      itemCount: items.length,
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
 * Updates a receipt header and replaces all its items.
 * The old items are deleted and the new items are inserted fresh.
 * Security: only updates if the receipt belongs to the requesting user.
 *
 * Expected body:
 * {
 *   storeName: string,
 *   purchaseDate: string,
 *   totalPrice: number,
 *   warrantyMonths: number,
 *   items: [{ productDescription, price, warrantyMonths }]
 * }
 */
async function updateReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;
    const { storeName, purchaseDate, totalPrice, warrantyMonths, items } = req.body;

    // Verify the receipt exists and belongs to this user
    const [existing] = await db.execute(
      'SELECT id FROM receipts WHERE id = ? AND user_id = ?',
      [receiptId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Encrypt the updated store name
    const encryptedStoreName = encryption.encrypt(storeName);

    // Update the receipt header row
    await db.execute(
      `UPDATE receipts
       SET store_name_enc = ?,
           purchase_date = ?,
           total_price = ?,
           warranty_months = ?
       WHERE id = ? AND user_id = ?`,
      [
        encryptedStoreName,
        purchaseDate,
        parseFloat(totalPrice) || 0,
        parseInt(warrantyMonths) || 12,
        receiptId,
        userId
      ]
    );

    // If items were provided, replace all existing items with the new ones
    // We delete and re-insert rather than trying to match individual items,
    // because the user may have added, removed, or reordered items during editing
    if (items && Array.isArray(items) && items.length > 0) {
      // Delete all existing items for this receipt
      await db.execute('DELETE FROM receipt_items WHERE receipt_id = ?', [receiptId]);

      // Insert the new items
      await insertReceiptItems(receiptId, items);
    }

    // Log the update
    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_UPDATED", `Receipt ${receiptId} updated with ${items ? items.length : 0} item(s)`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({
      success: true,
      message: 'Receipt updated successfully'
    });

  } catch (error) {
    console.error('Update receipt error:', error);
    return res.status(500).json({ error: 'Failed to update receipt' });
  }
}

/**
 * DELETE /receipts/:id
 * Deletes a receipt, all its items (via CASCADE), and its uploaded file.
 * Security: only deletes if the receipt belongs to the requesting user.
 */
async function deleteReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;

    // Fetch the receipt to get the file path before deleting
    const [rows] = await db.execute(
      'SELECT file_path FROM receipts WHERE id = ? AND user_id = ?',
      [receiptId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const filePath = rows[0].file_path;

    // Delete the receipt from the database.
    // receipt_items rows are deleted automatically via ON DELETE CASCADE.
    await db.execute(
      'DELETE FROM receipts WHERE id = ? AND user_id = ?',
      [receiptId, userId]
    );

    // Delete the associated file from disk if one exists
    if (filePath) {
      const fullPath = path.join(__dirname, '../../uploads', filePath);
      await fs.unlink(fullPath).catch(() => {
        console.log('File not found or already deleted:', filePath);
      });
    }

    // Log the deletion
    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_DELETED", `Receipt ${receiptId} deleted`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({
      success: true,
      message: 'Receipt deleted successfully'
    });

  } catch (error) {
    console.error('Delete receipt error:', error);
    return res.status(500).json({ error: 'Failed to delete receipt' });
  }
}

/**
 * GET /receipts/:id/file
 * Serves the uploaded receipt file securely.
 * Security: only serves the file if it belongs to the requesting user.
 * Also accepts JWT via query param (needed for direct <embed> and <img> src usage).
 */
async function getReceiptFile(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;

    // Verify the receipt exists and belongs to this user before serving the file
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

    // Build the full path to the file on disk
    const fullPath = path.join(__dirname, '../../uploads', fileName);

    // Check if the file actually exists before trying to send it
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Send the file - Express sets the correct Content-Type automatically
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