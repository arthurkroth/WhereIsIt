/**
 * Receipt controller for handling receipt-related endpoints.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

/**
 * Receipt Controller with OCR Integration
 * Handles receipt upload, OCR processing, and data storage
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

/**
 * POST /receipts/upload
 * Handles receipt file upload and OCR processing.
 * 
 * WORKFLOW:
 * 1. Receive uploaded file
 * 2. Process with OCR to extract text
 * 3. Parse text to extract structured data
 * 4. Encrypt sensitive fields
 * 5. Store in database
 * 6. Return extracted data to user for confirmation
 * 
 * SECURITY:
 * - File type validation
 * - Size limit enforcement
 * - Encryption of sensitive data
 * - Secure file storage with random names
 */
async function uploadReceipt(req, res) {
  try {
    console.log('Receipt upload request received');
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.userId;
    const file = req.file;

    console.log('Processing file:', file.originalname, 'Type:', file.mimetype, 'Size:', file.size);

    // Validate file type (security measure)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      // Delete the uploaded file
      await fs.unlink(file.path).catch(() => {});
      return res.status(400).json({ 
        error: 'Invalid file type. Only JPEG, PNG, and PDF files are allowed.' 
      });
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      await fs.unlink(file.path).catch(() => {});
      return res.status(400).json({ 
        error: 'File too large. Maximum size is 10MB.' 
      });
    }

    // Process receipt with OCR
    console.log('Starting OCR processing...');
    const ocrResult = await ocrService.processReceipt(file.path, file.mimetype);

    if (!ocrResult.success) {
      console.error('OCR processing failed:', ocrResult.error);
      // Still allow manual entry, but flag OCR failure
    }

    // Validate and apply business rules to extracted data
    const extractedData = ocrService.validateExtractedData(ocrResult.extractedData);

    console.log('OCR completed. Extracted data:', extractedData);

    // Encrypt sensitive fields
    const encryptedStoreName = encryption.encrypt(extractedData.storeName);
    const encryptedProduct = encryption.encrypt(extractedData.productDescription);

    // Store receipt in database with encrypted fields
    const [result] = await db.execute(
      `INSERT INTO receipts 
       (user_id, file_path, store_name_enc, purchase_date, product_desc_enc, 
        price_paid, warranty_months, ocr_confidence, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        file.filename, // Stored filename (already randomized by multer)
        encryptedStoreName,
        extractedData.purchaseDate,
        encryptedProduct,
        extractedData.price,
        extractedData.warrantyMonths,
        extractedData.confidence
      ]
    );

    const receiptId = result.insertId;

    // Log the action for audit
    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_UPLOADED", `Receipt uploaded with OCR confidence: ${extractedData.confidence}`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    // Return extracted data to frontend for user confirmation
    return res.json({
      success: true,
      receiptId: receiptId,
      message: 'Receipt uploaded and processed successfully',
      extractedData: {
        storeName: extractedData.storeName,
        purchaseDate: extractedData.purchaseDate,
        productDescription: extractedData.productDescription,
        price: extractedData.price,
        warrantyMonths: extractedData.warrantyMonths,
        confidence: extractedData.confidence
      },
      ocrSuccess: ocrResult.success,
      canEdit: true // User can edit the extracted data
    });

  } catch (error) {
    console.error('Receipt upload error:', error);
    
    // Clean up uploaded file on error
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
 */
async function createManualReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const { storeName, purchaseDate, productDescription, price, warrantyMonths } = req.body;

    // Validate required fields
    if (!storeName || !purchaseDate || !productDescription || price === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    // Encrypt sensitive fields
    const encryptedStoreName = encryption.encrypt(storeName);
    const encryptedProduct = encryption.encrypt(productDescription);

    // Store receipt in database
    const [result] = await db.execute(
      `INSERT INTO receipts 
       (user_id, file_path, store_name_enc, purchase_date, product_desc_enc, 
        price_paid, warranty_months, ocr_confidence, created_at) 
       VALUES (?, NULL, ?, ?, ?, ?, ?, 'manual', NOW())`,
      [
        userId,
        encryptedStoreName,
        purchaseDate,
        encryptedProduct,
        parseFloat(price),
        parseInt(warrantyMonths) || 12
      ]
    );

    // Log the action
    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_MANUAL_ENTRY", `Manual receipt created`]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({
      success: true,
      receiptId: result.insertId,
      message: 'Receipt created successfully'
    });

  } catch (error) {
    console.error('Manual receipt creation error:', error);
    return res.status(500).json({ 
      error: 'Failed to create receipt' 
    });
  }
}

/**
 * GET /receipts
 * Retrieves all receipts for the authenticated user.
 */
async function listReceipts(req, res) {
  try {
    const userId = req.user.userId;

    // Get all receipts for user
    const [rows] = await db.execute(
      `SELECT id, file_path, store_name_enc, purchase_date, product_desc_enc, 
              price_paid, warranty_months, ocr_confidence, created_at
       FROM receipts 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    // Decrypt sensitive fields for display
    const receipts = rows.map(receipt => {
      try {
        return {
          id: receipt.id,
          storeName: encryption.decrypt(receipt.store_name_enc),
          purchaseDate: receipt.purchase_date,
          productDescription: encryption.decrypt(receipt.product_desc_enc),
          price: receipt.price_paid,
          warrantyMonths: receipt.warranty_months,
          warrantyExpiry: calculateWarrantyExpiry(receipt.purchase_date, receipt.warranty_months),
          warrantyStatus: getWarrantyStatus(receipt.purchase_date, receipt.warranty_months),
          ocrConfidence: receipt.ocr_confidence,
          hasFile: receipt.file_path !== null,
          createdAt: receipt.created_at
        };
      } catch (err) {
        console.error('Decryption error for receipt', receipt.id, ':', err);
        return null;
      }
    }).filter(r => r !== null);

    return res.json({
      success: true,
      receipts: receipts,
      totalCount: receipts.length
    });

  } catch (error) {
    console.error('List receipts error:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve receipts' 
    });
  }
}

/**
 * PUT /receipts/:id
 * Updates a receipt with edited data (after OCR extraction).
 */
async function updateReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;
    const { storeName, purchaseDate, productDescription, price, warrantyMonths } = req.body;

    // Verify receipt belongs to user
    const [existing] = await db.execute(
      'SELECT id FROM receipts WHERE id = ? AND user_id = ?',
      [receiptId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    // Encrypt updated fields
    const encryptedStoreName = encryption.encrypt(storeName);
    const encryptedProduct = encryption.encrypt(productDescription);

    // Update receipt
    await db.execute(
      `UPDATE receipts 
       SET store_name_enc = ?, 
           purchase_date = ?, 
           product_desc_enc = ?, 
           price_paid = ?, 
           warranty_months = ?
       WHERE id = ? AND user_id = ?`,
      [
        encryptedStoreName,
        purchaseDate,
        encryptedProduct,
        parseFloat(price),
        parseInt(warrantyMonths),
        receiptId,
        userId
      ]
    );

    // Log the update
    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [userId, "RECEIPT_UPDATED", `Receipt ${receiptId} updated`]
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
    return res.status(500).json({ 
      error: 'Failed to update receipt' 
    });
  }
}

/**
 * DELETE /receipts/:id
 * Deletes a receipt and its associated file.
 */
async function deleteReceipt(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;

    // Get receipt to find file path
    const [rows] = await db.execute(
      'SELECT file_path FROM receipts WHERE id = ? AND user_id = ?',
      [receiptId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const filePath = rows[0].file_path;

    // Delete from database
    await db.execute(
      'DELETE FROM receipts WHERE id = ? AND user_id = ?',
      [receiptId, userId]
    );

    // Delete file if it exists
    if (filePath) {
      const fullPath = path.join(__dirname, '../../uploads', filePath);
      await fs.unlink(fullPath).catch(() => {
        console.log('File not found or already deleted');
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
    return res.status(500).json({ 
      error: 'Failed to delete receipt' 
    });
  }
}

/**
 * Helper function to calculate warranty expiry date.
 * 
 * @param {string} purchaseDate - Purchase date (YYYY-MM-DD)
 * @param {number} warrantyMonths - Warranty duration in months
 * @returns {string} Expiry date (YYYY-MM-DD)
 */
function calculateWarrantyExpiry(purchaseDate, warrantyMonths) {
  const purchase = new Date(purchaseDate);
  const expiry = new Date(purchase);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);
  return expiry.toISOString().split('T')[0];
}

/**
 * Helper function to get warranty status.
 * 
 * @param {string} purchaseDate - Purchase date (YYYY-MM-DD)
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
 * GET /receipts/:id
 * Returns a single receipt by ID for the authenticated user.
 * Only returns the receipt if it belongs to the requesting user (security).
 */
async function getReceiptById(req, res) {
  try {
    const userId = req.user.userId;
    const receiptId = req.params.id;

    // Fetch receipt - the WHERE clause ensures users can only see their own receipts
    const [rows] = await db.execute(
      `SELECT id, file_path, store_name_enc, purchase_date, product_desc_enc,
              price_paid, warranty_months, ocr_confidence, created_at
       FROM receipts
       WHERE id = ? AND user_id = ?`,
      [receiptId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const receipt = rows[0];

    // Decrypt the encrypted fields before sending to frontend
    const decrypted = {
      id: receipt.id,
      storeName: encryption.decrypt(receipt.store_name_enc),
      purchaseDate: receipt.purchase_date,
      productDescription: encryption.decrypt(receipt.product_desc_enc),
      price: receipt.price_paid,
      warrantyMonths: receipt.warranty_months,
      warrantyExpiry: calculateWarrantyExpiry(receipt.purchase_date, receipt.warranty_months),
      warrantyStatus: getWarrantyStatus(receipt.purchase_date, receipt.warranty_months),
      ocrConfidence: receipt.ocr_confidence,
      hasFile: receipt.file_path !== null,
      fileName: receipt.file_path,
      createdAt: receipt.created_at
    };

    return res.json({ success: true, receipt: decrypted });

  } catch (error) {
    console.error('Get receipt error:', error);
    return res.status(500).json({ error: 'Failed to retrieve receipt' });
  }
}

/**
 * GET /receipts/:id/file
 * Serves the uploaded receipt file securely.
 * Only serves the file if it belongs to the requesting user (security).
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

    // Check if the file actually exists on disk
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Send the file - Express will set the correct Content-Type automatically
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