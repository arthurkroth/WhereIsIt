/**
 * Receipt routes for uploading and managing receipts.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { Router } = require("express");
const multer = require("multer");
const fs = require("fs");
const { env } = require("../config/env");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  uploadAndCreateReceipt,
  listMyReceipts,
  createReceiptManual
} = require("../controllers/receiptController");

const receiptRoutes = Router();

/**
 * Ensuring that the upload directory exists.
 */
function ensureUploadDir() {
  if (!fs.existsSync(env.uploads.dir)) {
    fs.mkdirSync(env.uploads.dir, { recursive: true });
  }
}
ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploads.dir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: env.uploads.maxFileMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "application/pdf"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  }
});

receiptRoutes.get("/", requireAuth, asyncHandler(listMyReceipts));
receiptRoutes.post("/manual", requireAuth, asyncHandler(createReceiptManual));
receiptRoutes.post("/upload", requireAuth, upload.single("file"), asyncHandler(uploadAndCreateReceipt));

module.exports = { receiptRoutes };