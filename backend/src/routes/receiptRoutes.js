/**
 * Receipt Routes with File Upload Support
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  uploadReceipt,
  createManualReceipt,
  listReceipts,
  getReceiptById,
  getReceiptFile,
  updateReceipt,
  deleteReceipt
} = require("../controllers/receiptController");

const receiptRoutes = Router();

/**
 * Multer configuration for file uploads.
 * 
 * SECURITY MEASURES:
 * - Random filename generation (prevents file overwrites)
 * - File type filtering (only images and PDFs)
 * - Size limits (10MB max)
 * - Separate uploads directory
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Store files in uploads directory
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-randomstring-originalext
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'receipt-' + uniqueSuffix + ext);
  }
});

/**
 * File filter to validate file types.
 * Only allows images (JPEG, PNG) and PDFs.
 */
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
  }
};

/**
 * Multer upload configuration.
 */
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: fileFilter
});

/**
 * All receipt routes require authentication.
 */

// POST /receipts/upload - Upload receipt file with OCR processing
receiptRoutes.post(
  "/upload",
  requireAuth,
  upload.single('receipt'), // Expects field name 'receipt' in multipart form
  async (req, res) => {
    try {
      await uploadReceipt(req, res);
    } catch (error) {
      console.error('Upload route error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

// POST /receipts/manual - Create receipt with manual entry (no file)
receiptRoutes.post("/manual", requireAuth, async (req, res) => {
  try {
    await createManualReceipt(req, res);
  } catch (error) {
    console.error('Manual entry route error:', error);
    res.status(500).json({ error: 'Failed to create receipt' });
  }
});

// GET /receipts - List all receipts for user
receiptRoutes.get("/", requireAuth, async (req, res) => {
  try {
    await listReceipts(req, res);
  } catch (error) {
    console.error('List receipts route error:', error);
    res.status(500).json({ error: 'Failed to retrieve receipts' });
  }
});

// GET /receipts/:id - Get a single receipt by ID
receiptRoutes.get("/:id", requireAuth, async (req, res) => {
  try {
    await getReceiptById(req, res);
  } catch (error) {
    console.error('Get receipt route error:', error);
    res.status(500).json({ error: 'Failed to retrieve receipt' });
  }
});

// GET /receipts/:id/file - Serve the receipt file securely
receiptRoutes.get("/:id/file", requireAuth, async (req, res) => {
  try {
    await getReceiptFile(req, res);
  } catch (error) {
    console.error('Get receipt file route error:', error);
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

// PUT /receipts/:id - Update receipt data
receiptRoutes.put("/:id", requireAuth, async (req, res) => {
  try {
    await updateReceipt(req, res);
  } catch (error) {
    console.error('Update receipt route error:', error);
    res.status(500).json({ error: 'Failed to update receipt' });
  }
});

// DELETE /receipts/:id - Delete receipt and file
receiptRoutes.delete("/:id", requireAuth, async (req, res) => {
  try {
    await deleteReceipt(req, res);
  } catch (error) {
    console.error('Delete receipt route error:', error);
    res.status(500).json({ error: 'Failed to delete receipt' });
  }
});

/**
 * Error handling middleware for multer errors.
 */
receiptRoutes.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large. Maximum size is 10MB.'
      });
    }
    return res.status(400).json({
      error: error.message
    });
  }
  next(error);
});

module.exports = { receiptRoutes };