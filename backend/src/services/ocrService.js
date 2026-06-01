/**
 * OCR Service for extracting text from receipt images.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * OCR Service — routes receipt processing based on user tier:
 *
 * PREMIUM users → OpenAI GPT-4o-mini (Vision for images, text for PDFs)
 *   - Higher accuracy, handles complex layouts, multi-language
 *   - Falls back to Tesseract automatically if OpenAI is unavailable
 *     (quota exceeded, network error, API outage)
 *
 * FREE users → Tesseract.js (local OCR engine)
 *   - No API cost, works offline
 *   - Rule-based parsing with regex extraction
 */

const Tesseract = require('tesseract.js');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const { processReceiptWithOpenAI } = require('./openaiService');

class OcrService {
  constructor() {
    this.lang = 'eng';
  }

  /**
   * Main entry point. Routes to OpenAI (Premium) or Tesseract (Free).
   * If OpenAI fails for any reason, automatically falls back to Tesseract
   * and returns an aiProviderError flag so the frontend can notify the user.
   *
   * @param {string} filePath - Path to the uploaded file
   * @param {string} mimeType - MIME type of the file
   * @param {string} userRole - 'PREMIUM' or 'FREE'
   * @returns {Promise<Object>} Extracted receipt data including items array
   */
  async processReceipt(filePath, mimeType, userRole = 'FREE') {
    if (userRole === 'PREMIUM') {
      console.log('Premium user — using OpenAI OCR');
      try {
        const result = await processReceiptWithOpenAI(filePath, mimeType);
        return result;
      } catch (err) {
        // OpenAI failed (quota exceeded, network error, invalid key, etc.)
        // Fall back to Tesseract so Premium users always get some result
        console.warn('OpenAI OCR failed, falling back to Tesseract:', err.message);
        const fallbackResult = await this.processTesseract(filePath, mimeType);
        return {
          ...fallbackResult,
          aiProviderError: true,
          aiProviderMessage: 'AI-enhanced OCR is temporarily unavailable. Basic OCR was used instead. Please review the extracted fields carefully.'
        };
      }
    }

    // Free users always use Tesseract
    console.log('Free user — using Tesseract OCR');
    return await this.processTesseract(filePath, mimeType);
  }

  /**
   * Tesseract-based processing pipeline for Free tier users.
   * Also used as a fallback for Premium users when OpenAI is unavailable.
   *
   * @param {string} filePath - Path to the file
   * @param {string} mimeType - MIME type
   * @returns {Promise<Object>} Extracted receipt data
   */
  async processTesseract(filePath, mimeType) {
    try {
      let extractedText = '';

      if (mimeType === 'application/pdf') {
        extractedText = await this.processPdf(filePath);
      } else if (mimeType.startsWith('image/')) {
        extractedText = await this.processImage(filePath);
      } else {
        throw new Error('Unsupported file type');
      }

      console.log('Tesseract raw text (first 300 chars):', extractedText.substring(0, 300));
      const parsedData = this.parseReceiptText(extractedText);

      return {
        success: true,
        rawText: extractedText,
        extractedData: parsedData,
        confidence: parsedData.confidence || 'medium'
      };

    } catch (error) {
      console.error('Tesseract processing error:', error);
      return {
        success: false,
        error: error.message,
        extractedData: this.getDefaultData()
      };
    }
  }

  /**
   * Preprocesses an image with sharp before Tesseract for better accuracy.
   * Upscales, greyscales, normalises, binarizes, and sharpens.
   * @param {string} imagePath
   * @returns {Promise<string>} Path to preprocessed temp image
   */
  async preprocessImage(imagePath) {
    const sharp = require('sharp');
    const tempPath = imagePath + '_processed.png';
    const metadata = await sharp(imagePath).metadata();
    await sharp(imagePath)
      .resize(metadata.width * 2, metadata.height * 2)
      .greyscale()
      .normalise()
      .threshold(140)
      .sharpen({ sigma: 1.5 })
      .png()
      .toFile(tempPath);
    return tempPath;
  }

  /**
   * Processes an image file through Tesseract OCR after preprocessing.
   * @param {string} imagePath
   * @returns {Promise<string>} Extracted text
   */
  async processImage(imagePath) {
    let tempPath = null;
    try {
      tempPath = await this.preprocessImage(imagePath);
      const result = await Tesseract.recognize(tempPath, this.lang, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      return result.data.text;
    } finally {
      if (tempPath) await fs.unlink(tempPath).catch(() => {});
    }
  }

  /**
   * Extracts text from a PDF file using pdf-parse.
   * @param {string} pdfPath
   * @returns {Promise<string>} Extracted text
   */
  async processPdf(pdfPath) {
    const dataBuffer = await fs.readFile(pdfPath);
    const pdfData = await pdfParse(dataBuffer);
    return pdfData.text;
  }

  /** Cleans a single line of OCR noise characters. */
  cleanLine(line) {
    return line.replace(/[|\\~^{}[\]]/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  /** Splits raw text into clean non-empty lines. */
  getCleanLines(text) {
    return text.split('\n').map(line => this.cleanLine(line)).filter(line => line.length >= 2);
  }

  /** Returns true if a line is footer/legal text to be ignored. */
  isFooterLine(line) {
    const footerKeywords = [
      'thank you', 'thanks for', 'please retain', 'vat reg', 'vat no',
      'company reg', 'registered in', 'recycling', 'contribution',
      'return policy', 'all prices', 'e&oe', 'errors', 'omissions',
      'www.', 'http', '.com', '.ie', '.co.uk', 'tel:', 'phone:', 'fax:',
      'email:', 'follow us', 'facebook', 'twitter', 'how was it',
      'tell us', 'feedback', 'your no 1', 'registered office',
      'inter ikea', '© inter', 'is a company registered'
    ];
    const lower = line.toLowerCase();
    return footerKeywords.some(kw => lower.includes(kw));
  }

  /** Returns true if a line looks like a postal address. */
  isAddressLine(line) {
    const lower = line.toLowerCase().trim();
    const placeNames = ['ireland', 'northern ireland', 'united kingdom', 'england', 'scotland', 'wales'];
    if (placeNames.includes(lower)) return true;
    if (/^[A-Z]{1,2}\d{1,2}\s+[A-Z0-9]{3,4}$/.test(line.trim())) return true;
    if (/^\d{1,4}\s+[A-Za-z]/.test(line.trim())) return true;
    const addressKeywords = ['floor,', 'road,', 'street,', 'avenue,', 'lane,', 'drive,',
      'place,', 'square,', 'park,', 'dublin,', 'cork,', 'galway,', 'wokingham,', 'triangle,'];
    if (addressKeywords.some(kw => lower.includes(kw))) return true;
    return false;
  }

  /** Detects invoice-style documents (IKEA, Fanatec etc.). */
  isInvoiceDocument(lines) {
    const invoiceKeywords = [
      'buyer:', 'seller:', 'invoice details', 'delivery address:',
      'supplier', 'vendor:', 'bill to:', 'issue date:', 'invoice no',
      'invoice number', 'invoice date', 'order number',
      'amount due:', 'amount paid:', 'total incl. tax', 'total excl. tax',
      'total including tax', 'total excluding tax'
    ];
    const firstFiftyLines = lines.slice(0, 50).map(l => l.toLowerCase());
    return invoiceKeywords.some(kw => firstFiftyLines.some(line => line.includes(kw)));
  }

  /** Finds the product table start line in an invoice PDF. */
  findProductTableStart(lines) {
    const tableHeaderKeywords = ['art. no', 'article name', 'article no',
      'item', 'description', 'qty', 'quantity', 'unit price', 'total', 'tax amount'];
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      const matchCount = tableHeaderKeywords.filter(kw => lower.includes(kw)).length;
      if (matchCount >= 2) return i + 1;
    }
    return -1;
  }

  /** Checks if a line is an IKEA article number line. */
  isIkeaProductLine(line) {
    return /^\d{3}\.\d{3}\.\d{2,3}/.test(line);
  }

  /** Parses an IKEA product line, stripping article number and column data. */
  parseIkeaProductLine(line) {
    let price = 0;
    const finalPriceMatch = line.match(/[€£$]\s*(\d{1,6}[.,]\d{2})\s*$/);
    if (finalPriceMatch) price = parseFloat(finalPriceMatch[1].replace(',', '.'));
    let description = line.replace(/^\d{3}\.\d{3}\.\d{2,3}/, '').trim();
    description = description.replace(/[€£$]\s*\d{1,6}[.,]\d{2}\s*$/, '').trim();
    description = description.replace(/\s*\d{1,2}\s*%\s*$/, '').trim();
    description = description.replace(/\s*\d{1,6}[.,]\d{2}\s*$/, '').trim();
    description = description.replace(/\s+\d{1,3}$/, '').trim();
    return { description, price };
  }

  /**
   * Parses a generic invoice line (e.g. Fanatec).
   * Handles multi-column layouts where the last column is often a tax amount.
   */
  parseGenericInvoiceLine(line) {
    const allEuroPrices = [...line.matchAll(/[€£$]\s*(\d{1,6}[.,]\d{2})/g)];
    let price = 0;
    if (allEuroPrices.length >= 2) {
      price = parseFloat(allEuroPrices[allEuroPrices.length - 2][1].replace(',', '.'));
    } else if (allEuroPrices.length === 1) {
      price = parseFloat(allEuroPrices[0][1].replace(',', '.'));
    }
    let description = line;
    description = description.replace(/(?:\s*[€£$]\s*\d{1,6}[.,]\d{2})+\s*$/, '').trim();
    description = description.replace(/\s*\d{1,2}\s*%\s*$/, '').trim();
    description = description.replace(/\s*\d{1,6}[.,]\d{2}\s*$/, '').trim();
    description = description.replace(/\s+\d{1,3}$/, '').trim();
    description = description.replace(/\s*sku\s*:\s*\S+/gi, '').trim();
    description = description.replace(/\s*ref\s*:\s*\S+/gi, '').trim();
    description = description.replace(/\s*barcode\s*:\s*\S+/gi, '').trim();
    description = description.replace(/\s*art\s*\.?\s*no\.?\s*:\s*\S+/gi, '').trim();
    return { description, price };
  }

  /** Applies quality fallback — collapses to placeholder if >50% items have no price. */
  applyQualityFallback(items, isInvoice) {
    if (isInvoice) return items;
    const zeroPriceCount = items.filter(item => !item.price || item.price === 0).length;
    const totalItems = items.length;
    if (totalItems > 1 && zeroPriceCount > totalItems / 2) {
      return [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }];
    }
    const metadataPatterns = [
      /^size\s*:/i, /^colour\s*:/i, /^color\s*:/i, /^style\s*:/i,
      /^\(p\)\s/i, /^\d+%/, /^ref\s*:/i, /^sku\s*:/i,
      /^barcode/i, /student card/i, /loyalty card/i, /discount/i,
    ];
    const filteredItems = items.filter(item => {
      if (item.price && item.price > 0) return true;
      return !metadataPatterns.some(p => p.test(item.productDescription));
    });
    return filteredItems.length === 0
      ? [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }]
      : filteredItems;
  }

  /** Top-level parser — extracts all fields from raw OCR text. */
  parseReceiptText(text) {
    const lines = this.getCleanLines(text);
    const isInvoice = this.isInvoiceDocument(lines);
    const storeName = this.extractStoreName(text);
    const purchaseDate = this.extractDate(text);
    const rawItems = this.extractItems(text, isInvoice);
    const items = this.applyQualityFallback(rawItems, isInvoice);
    const totalPrice = this.extractTotalPrice(text);
    const warrantyMonths = this.extractWarranty(text);
    const extractedCount = [
      storeName !== 'Unknown Store',
      purchaseDate !== new Date().toISOString().split('T')[0],
      items.length > 0 && items[0].productDescription !== 'Receipt Item',
      totalPrice > 0
    ].filter(Boolean).length;
    let confidence = 'low';
    if (extractedCount >= 3) confidence = 'high';
    else if (extractedCount >= 2) confidence = 'medium';
    return { storeName, purchaseDate, items, totalPrice, warrantyMonths, confidence };
  }

  /** Extracts store name using three strategies. */
  extractStoreName(text) {
    const lines = this.getCleanLines(text);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().trim() === 'seller:') {
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
          const candidate = lines[j].trim();
          if (candidate.length >= 3 && !candidate.toLowerCase().startsWith('vat') &&
              !this.isAddressLine(candidate) && !candidate.match(/^\d/) && !candidate.includes('"')) {
            return candidate.substring(0, 80);
          }
        }
      }
    }
    const supplierLabels = ['supplier', 'vendor:', 'sold by:'];
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase().trim();
      if (supplierLabels.some(label => lower === label || lower.startsWith(label))) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const candidate = lines[j].trim();
          if (candidate.length >= 3 && !candidate.toLowerCase().startsWith('vat') &&
              !this.isAddressLine(candidate) && !candidate.match(/^\d/) && !candidate.includes(':')) {
            return candidate.substring(0, 80);
          }
        }
      }
    }
    const pageHeaderNoise = ['page ', 'invoice', 'receipt', 'order confirmation', 'tax invoice',
      'issue date', 'invoice no', 'invoice:', 'client', 'supplier', 'amount due', 'amount paid'];
    for (const line of lines.slice(0, 8)) {
      if (line.match(/\d{3,}/)) continue;
      if (line.length > 60) continue;
      if (this.isFooterLine(line)) continue;
      if (this.isAddressLine(line)) continue;
      if (pageHeaderNoise.some(n => line.toLowerCase().startsWith(n))) continue;
      if ((line.match(/[a-zA-Z]/g) || []).length >= 3) return line.substring(0, 80);
    }
    return 'Unknown Store';
  }

  /** Extracts purchase date, trying multiple date formats. */
  extractDate(text) {
    const datePatterns = [
      { regex: /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/, order: 'dmy' },
      { regex: /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/, order: 'ymd' },
      { regex: /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})/, order: 'dmy2' },
      { regex: /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/i, order: 'dmy_word' },
      { regex: /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i, order: 'mdy_word' }
    ];
    for (const { regex, order } of datePatterns) {
      const match = text.match(regex);
      if (!match) continue;
      try {
        let day, month, year;
        const monthNames = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
        if (order === 'dmy') [day, month, year] = [match[1], match[2], match[3]];
        else if (order === 'ymd') [year, month, day] = [match[1], match[2], match[3]];
        else if (order === 'dmy2') { [day, month] = [match[1], match[2]]; year = '20' + match[3]; }
        else if (order === 'dmy_word') { day = match[1]; month = monthNames[match[2].substring(0,3).toLowerCase()]; year = match[3]; }
        else if (order === 'mdy_word') { month = monthNames[match[1].substring(0,3).toLowerCase()]; day = match[2]; year = match[3]; }
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime()) && parsed <= new Date()) return parsed.toISOString().split('T')[0];
      } catch {}
    }
    return new Date().toISOString().split('T')[0];
  }

  /** Extracts line items from receipt text. */
  extractItems(text, isInvoice) {
    const lines = this.getCleanLines(text);
    const items = [];
    const hardStopKeywords = ['subtotal', 'sub-total', 'amount due', 'balance due',
      'grand total', 'vat specification', 'payment details', 'payment type', 'net amount'];
    const softStopKeywords = ['total', 'goods', 'services'];
    const columnSubHeaders = ['original price', 'vat included', 'vat rate', 'total price vat',
      'included', 'unit price', 'line total', 'excl. vat', 'incl. vat', 'tax amount', 'unit price incl. tax'];
    const skipKeywords = ['order', 'receipt', 'invoice', 'customer', 'cashier', 'assistant',
      'served by', 'transaction', 'store', 'branch', 'qty', 'quantity', 'amount', 'payment', 'cash',
      'change', 'paid', 'tel', 'phone', 'email', 'barcode', 'size', 'colour', 'color', 'style no', 'style:',
      'less discount', 'student card', 'loyalty card', 'art. no', 'buyer', 'seller', 'supplier', 'client',
      'invoice details', 'order date', 'invoice date', 'delivery date', 'delivery address',
      'billing address', 'ship to', 'bill to', 'page ', 'collection date', 'order number',
      'invoice number', 'issue date', 'invoice no', 'invoice:', 'reference', 'pan seq', 'pref. name',
      'card type', 'entry mode', 'auth code', 'till location', 'receipt no', 'transaction id',
      'merchant id', 'how was it', '** sale **', 'standard delivery', 'express delivery',
      'next day delivery', 'vat registration', 'vat number', 'reg no'];
    const endPricePattern = /[€£$]?\s*(\d{1,6}[.,]\d{2})\s*$/;
    let startIndex = 4;
    if (isInvoice) {
      const tableStart = this.findProductTableStart(lines);
      if (tableStart !== -1) startIndex = tableStart;
    }
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase().trim();
      if (hardStopKeywords.some(kw => lower.includes(kw))) break;
      if (columnSubHeaders.some(kw => lower === kw || lower.startsWith(kw + ' '))) continue;
      if (softStopKeywords.some(kw => lower.startsWith(kw))) break;
      if (this.isFooterLine(line)) continue;
      if (this.isAddressLine(line)) continue;
      if (skipKeywords.some(kw => lower.startsWith(kw))) continue;
      if (skipKeywords.some(kw => lower === kw)) continue;
      if (/^[\d\s\.,€£$\-]+$/.test(line)) continue;
      if (line.length < 4) continue;
      if ((line.match(/[a-zA-Z]/g) || []).length < 3) continue;
      let productDescription = '', price = 0;
      if (isInvoice && this.isIkeaProductLine(line)) {
        const parsed = this.parseIkeaProductLine(line);
        productDescription = parsed.description; price = parsed.price;
      } else if (isInvoice) {
        const parsed = this.parseGenericInvoiceLine(line);
        productDescription = parsed.description; price = parsed.price;
      } else {
        const priceMatch = line.match(endPricePattern);
        if (priceMatch) price = parseFloat(priceMatch[1].replace(',', '.'));
        productDescription = line.replace(endPricePattern, '').trim();
      }
      if (!productDescription || productDescription.length < 3) continue;
      items.push({ productDescription: productDescription.substring(0, 200),
        price: isNaN(price) ? 0 : price, warrantyMonths: 12 });
    }
    if (items.length === 0) items.push({ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 });
    return items;
  }

  /** Extracts total price, prioritising tax-inclusive totals. */
  extractTotalPrice(text) {
    const lines = this.getCleanLines(text);
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('invoice total')) {
        const allPricesOnLine = [...line.matchAll(/[€£$]\s*(\d{1,6}[.,]\d{2})/g)];
        if (allPricesOnLine.length > 0) {
          const price = parseFloat(allPricesOnLine[allPricesOnLine.length - 1][1].replace(',', '.'));
          if (!isNaN(price) && price > 0) return price;
        }
      }
      if (lower.includes('total incl') || lower.includes('total including')) {
        const priceMatch = line.match(/[€£$]\s*(\d{1,6}[.,]\d{2})/);
        if (priceMatch) { const p = parseFloat(priceMatch[1].replace(',', '.')); if (!isNaN(p) && p > 0) return p; }
      }
      if (lower.includes('amount paid')) {
        const priceMatch = line.match(/[€£$]\s*(\d{1,6}[.,]\d{2})/);
        if (priceMatch) { const p = parseFloat(priceMatch[1].replace(',', '.')); if (!isNaN(p) && p > 0) return p; }
      }
      if (lower.startsWith('total') && !lower.includes('excl') && !lower.includes('excluding')) {
        const priceMatch = line.match(/[€£$]?\s*(\d{1,6}[.,]\d{2})/);
        if (priceMatch) { const p = parseFloat(priceMatch[1].replace(',', '.')); if (!isNaN(p) && p > 0) return p; }
      }
    }
    const allPrices = (text.match(/[€£$]?\s*(\d{1,6}[.,]\d{2})/g) || [])
      .map(p => parseFloat(p.replace(/[^\d.,]/g, '').replace(',', '.')))
      .filter(p => !isNaN(p) && p > 0 && p < 100000);
    return allPrices.length > 0 ? Math.max(...allPrices) : 0.00;
  }

  /** Extracts warranty duration from receipt text. */
  extractWarranty(text) {
    const warrantyPatterns = [
      /(\d+)\s*(?:year|yr)s?\s*warranty/i, /warranty[\s:]+(\d+)\s*(?:month|mo)s?/i,
      /warranty[\s:]+(\d+)\s*(?:year|yr)s?/i, /(\d+)\s*(?:month|mo)s?\s*guarantee/i,
      /(\d+)\s*(?:year|yr)s?\s*guarantee/i, /guarantee[\s:]+(\d+)\s*(?:month|mo)s?/i
    ];
    for (const pattern of warrantyPatterns) {
      const match = text.match(pattern);
      if (match) {
        const duration = parseInt(match[1]);
        const isYears = pattern.toString().includes('year') || pattern.toString().includes('yr');
        return isYears ? duration * 12 : duration;
      }
    }
    return 12;
  }

  /** Returns safe default data when OCR fails completely. */
  getDefaultData() {
    return {
      storeName: 'Unknown Store',
      purchaseDate: new Date().toISOString().split('T')[0],
      items: [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }],
      totalPrice: 0.00, warrantyMonths: 12, confidence: 'low'
    };
  }

  /** Validates extracted data and applies business rules. */
  validateExtractedData(data) {
    if (!data.totalPrice || data.totalPrice < 0) data.totalPrice = 0;
    if (!data.warrantyMonths || data.warrantyMonths < 0 || data.warrantyMonths > 120) data.warrantyMonths = 12;
    const purchaseDate = new Date(data.purchaseDate);
    if (isNaN(purchaseDate.getTime()) || purchaseDate > new Date()) {
      data.purchaseDate = new Date().toISOString().split('T')[0];
    }
    if (data.storeName) data.storeName = data.storeName.trim().substring(0, 100);
    if (data.items && Array.isArray(data.items)) {
      data.items = data.items.map(item => ({
        productDescription: (item.productDescription || 'Receipt Item').trim().substring(0, 200),
        price: isNaN(parseFloat(item.price)) ? 0 : Math.max(0, parseFloat(item.price)),
        warrantyMonths: (!item.warrantyMonths || item.warrantyMonths < 0 || item.warrantyMonths > 120)
          ? 12 : parseInt(item.warrantyMonths)
      }));
    } else {
      data.items = [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }];
    }
    return data;
  }
}

module.exports = { OcrService };