/**
 * Receipt controller for handling receipt-related endpoints.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { ReceiptService } = require("../services/receiptService");
const { OcrService } = require("../services/ocrService");
const { AuditLogService } = require("../services/auditLogService");
const { createReceiptManualSchema } = require("../validation/receiptValidation");

const receipts = new ReceiptService();
const ocr = new OcrService();
const audit = new AuditLogService();

/**
 * POST /receipts/upload  (multipart/form-data with "file")
 */
async function uploadAndCreateReceipt(req, res) {
  const user = req.user;
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const text = await ocr.extractText(file.path);
  const parsed = ocr.parseReceipt(text);

  const receiptId = await receipts.createReceipt(user.userId, {
    ...parsed,
    filePath: file.path
  });

  await audit.log(user.userId, "RECEIPT_UPLOAD", `Receipt created: ${receiptId}`);
  res.status(201).json({ receiptId, extracted: parsed });
}

/**
 * POST /receipts/manual
 */
async function createReceiptManual(req, res) {
  const user = req.user;
  const body = createReceiptManualSchema.parse(req.body);

  const receiptId = await receipts.createReceipt(user.userId, {
    ...body,
    filePath: "manual-entry"
  });

  await audit.log(user.userId, "RECEIPT_MANUAL_CREATE", `Receipt created: ${receiptId}`);
  res.status(201).json({ receiptId });
}

/**
 * GET /receipts
 */
async function listMyReceipts(req, res) {
  const user = req.user;
  const list = await receipts.listReceipts(user.userId);
  res.json({ receipts: list });
}

module.exports = { uploadAndCreateReceipt, createReceiptManual, listMyReceipts };