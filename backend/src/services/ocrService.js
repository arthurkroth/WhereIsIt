/**
 * OCR Service for extracting text from receipt images.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

/**
 * Placeholder OCR service.
 * TO-DO: integrate Tesseract.js and return real extracted text.
 */
class OcrService {
  /**
   * Returns OCR text extracted from an uploaded file.
   * @param {string} _filePath
   * @returns {Promise<string>}
   */
  async extractText(_filePath) {
    // TODO: integrate real OCR
    return "STORE: Example Store\nDATE: 2026-01-01\nTOTAL: 199.99\nITEM: Example Product\nWARRANTY: 24 months";
  }

  /**
   * Parses receipt-like text into structured fields.
   * @param {string} text
   */
  parseReceipt(text) {
    const storeName = (text.match(/STORE:\s*(.*)/)?.[1] || "Unknown").trim();
    const purchaseDate = (text.match(/DATE:\s*(.*)/)?.[1] || "1970-01-01").trim();
    const pricePaid = Number((text.match(/TOTAL:\s*([0-9.]+)/)?.[1] || "0").trim());
    const productDescription = (text.match(/ITEM:\s*(.*)/)?.[1] || "Unknown").trim();
    const warrantyMonths = Number((text.match(/WARRANTY:\s*([0-9]+)/)?.[1] || "0").trim());

    return { storeName, purchaseDate, productDescription, pricePaid, warrantyMonths };
  }
}

module.exports = { OcrService };