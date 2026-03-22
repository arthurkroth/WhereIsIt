/**
 * OCR Service for extracting text from receipt images.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const Tesseract = require('tesseract.js');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');

/**
 * OcrService class handles OCR processing and text extraction from receipts.
 *
 * FEATURES:
 * - Extracts text from images (PNG, JPEG) and PDFs
 * - Preprocesses images with sharp for better OCR accuracy
 * - Handles till receipts, IKEA-style invoices, and generic invoices (e.g. Fanatec)
 * - Extracts multiple line items from a single receipt
 * - Returns structured data (store, date, items array, total price, warranty)
 *
 * SUPPORTED DOCUMENT TYPES:
 * 1. Till receipts (Schuh, DID Electrical etc.) — scans from line 4, filters metadata
 * 2. IKEA-style invoices — has Seller: label, article numbers, finds table header
 * 3. Generic invoices (Fanatec, Amazon etc.) — has Supplier/Vendor labels,
 *    multi-column price format (unit price | total | tax amount)
 *
 * QUALITY FALLBACK:
 * If more than half the extracted items have no price, the list is collapsed
 * to a single placeholder so the user gets a clean form to fill in.
 *
 * SECURITY NOTES:
 * - Processes files in isolated environment
 * - Validates file types before processing
 * - Cleans up temporary files after processing
 */
class OcrService {
  constructor() {
    this.lang = 'eng';
  }

  /**
   * Processes an uploaded receipt file and extracts text using OCR.
   *
   * @param {string} filePath - Path to the uploaded file
   * @param {string} mimeType - MIME type of the file
   * @returns {Promise<Object>} Extracted receipt data including items array
   */
  async processReceipt(filePath, mimeType) {
    try {
      console.log('Starting OCR processing for:', filePath);

      let extractedText = '';

      if (mimeType === 'application/pdf') {
        extractedText = await this.processPdf(filePath);
      } else if (mimeType.startsWith('image/')) {
        extractedText = await this.processImage(filePath);
      } else {
        throw new Error('Unsupported file type');
      }

      console.log('Raw OCR text (first 300 chars):', extractedText.substring(0, 300));

      const parsedData = this.parseReceiptText(extractedText);

      return {
        success: true,
        rawText: extractedText,
        extractedData: parsedData,
        confidence: parsedData.confidence || 'medium'
      };

    } catch (error) {
      console.error('OCR processing error:', error);
      return {
        success: false,
        error: error.message,
        extractedData: this.getDefaultData()
      };
    }
  }

  /**
   * Preprocesses an image using sharp to improve OCR accuracy.
   *
   * Steps applied:
   * 1. Upscale to 2x - Tesseract works much better on larger images
   * 2. Greyscale - removes colour noise that confuses OCR
   * 3. Normalise - stretches contrast so text becomes darker vs background
   * 4. Threshold (binarize) - converts to pure black/white, removes shadows
   * 5. Sharpen - makes letter edges crisper
   * 6. Save as PNG - Tesseract is most accurate with PNG files
   *
   * @param {string} imagePath - Path to original image
   * @returns {Promise<string>} Path to the preprocessed temporary image
   */
  async preprocessImage(imagePath) {
    const sharp = require('sharp');
    const tempPath = imagePath + '_processed.png';

    const metadata = await sharp(imagePath).metadata();
    const newWidth = metadata.width * 2;
    const newHeight = metadata.height * 2;

    await sharp(imagePath)
      .resize(newWidth, newHeight)
      .greyscale()
      .normalise()
      .threshold(140)
      .sharpen({ sigma: 1.5 })
      .png()
      .toFile(tempPath);

    return tempPath;
  }

  /**
   * Processes an image file using Tesseract OCR.
   * Preprocesses the image first to improve accuracy.
   *
   * @param {string} imagePath - Path to image file
   * @returns {Promise<string>} Extracted text
   */
  async processImage(imagePath) {
    let tempPath = null;

    try {
      console.log('Preprocessing image to improve OCR quality...');
      tempPath = await this.preprocessImage(imagePath);
      console.log('Processing preprocessed image with Tesseract...');

      const result = await Tesseract.recognize(
        tempPath,
        this.lang,
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );

      return result.data.text;

    } catch (error) {
      console.error('Tesseract processing error:', error);
      throw new Error('Failed to extract text from image');
    } finally {
      if (tempPath) await fs.unlink(tempPath).catch(() => {});
    }
  }

  /**
   * Processes a PDF file by extracting its text content.
   * Only works on text-based PDFs. Scanned PDFs need image conversion.
   *
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<string>} Extracted text
   */
  async processPdf(pdfPath) {
    try {
      console.log('Processing PDF...');
      const dataBuffer = await fs.readFile(pdfPath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text;
    } catch (error) {
      console.error('PDF processing error:', error);
      throw new Error('Failed to extract text from PDF. The PDF may be image-based.');
    }
  }

  /**
   * Cleans a single line of OCR text by removing common OCR noise characters.
   *
   * @param {string} line - A single line of raw OCR text
   * @returns {string} Cleaned line
   */
  cleanLine(line) {
    return line
      .replace(/[|\\~^{}[\]]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Splits raw OCR text into clean, non-empty lines.
   *
   * @param {string} text - Raw OCR text
   * @returns {string[]} Array of cleaned lines
   */
  getCleanLines(text) {
    return text
      .split('\n')
      .map(line => this.cleanLine(line))
      .filter(line => line.length >= 2);
  }

  /**
   * Checks if a line looks like footer/legal text that should be ignored.
   *
   * @param {string} line - A cleaned receipt line
   * @returns {boolean} True if the line should be ignored
   */
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

  /**
   * Checks if a line looks like an address line that should be ignored.
   * Important for invoice-style PDFs that contain buyer/seller addresses.
   *
   * @param {string} line - A cleaned receipt line
   * @returns {boolean} True if the line looks like an address
   */
  isAddressLine(line) {
    const lower = line.toLowerCase().trim();

    // Standalone country or city names
    const placeNames = ['ireland', 'northern ireland', 'united kingdom', 'england', 'scotland', 'wales'];
    if (placeNames.includes(lower)) return true;

    // Irish/UK postal codes e.g. "D15 WP4A", "EC1A 1BB"
    if (/^[A-Z]{1,2}\d{1,2}\s+[A-Z0-9]{3,4}$/.test(line.trim())) return true;

    // Lines starting with a street number e.g. "118 Barnwell Point"
    // Only match digits-space-letter, NOT digits-dot (IKEA article numbers)
    if (/^\d{1,4}\s+[A-Za-z]/.test(line.trim())) return true;

    // Lines containing typical address keywords with commas
    const addressKeywords = [
      'floor,', 'road,', 'street,', 'avenue,', 'lane,', 'drive,',
      'place,', 'square,', 'park,', 'dublin,', 'cork,', 'galway,',
      'wokingham,', 'triangle,'
    ];
    if (addressKeywords.some(kw => lower.includes(kw))) return true;

    return false;
  }

  /**
   * Detects whether this text is from an invoice-style document.
   * Supports both IKEA-style invoices (Buyer:/Seller: labels) and
   * generic invoices (Supplier:/Client: labels, e.g. Fanatec, Amazon).
   *
   * @param {string[]} lines - Cleaned lines of text
   * @returns {boolean} True if this looks like an invoice document
   */
  isInvoiceDocument(lines) {
    const invoiceKeywords = [
      // IKEA-style labels
      'buyer:', 'seller:', 'invoice details', 'delivery address:',
      // Generic invoice labels (Fanatec, Amazon etc.)
      'supplier', 'vendor:', 'bill to:', 'issue date:', 'invoice no',
      'invoice number', 'invoice date', 'order number',
      // Common invoice total labels
      'amount due:', 'amount paid:', 'total incl. tax', 'total excl. tax',
      'total including tax', 'total excluding tax'
    ];
    const firstFiftyLines = lines.slice(0, 50).map(l => l.toLowerCase());
    const result = invoiceKeywords.some(kw => firstFiftyLines.some(line => line.includes(kw)));
    console.log(`isInvoiceDocument: ${result}`);
    return result;
  }

  /**
   * Finds the line index where the product table starts in an invoice PDF.
   * Looks for a table header row containing at least two table header keywords.
   *
   * Supports both IKEA format ("Art. No. Article Name Quantity") and
   * generic invoice format ("Item Description Quantity Unit Price Total").
   *
   * @param {string[]} lines - Cleaned lines of text
   * @returns {number} Index of the first product line (line after header), or -1 if not found
   */
  findProductTableStart(lines) {
    const tableHeaderKeywords = [
      // IKEA format
      'art. no', 'article name', 'article no',
      // Generic invoice format
      'item', 'description', 'qty', 'quantity',
      'unit price', 'total', 'tax amount'
    ];

    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      const matchCount = tableHeaderKeywords.filter(kw => lower.includes(kw)).length;
      // Require at least 2 matches to avoid false positives
      if (matchCount >= 2) {
        console.log(`Found product table header at line ${i}: "${lines[i]}"`);
        return i + 1;
      }
    }

    return -1;
  }

  /**
   * Checks if a line is an IKEA-style product line.
   * IKEA product lines start with an article number: digits.digits.digits
   * e.g. "702.809.93KOPPLA socket 3-w w 2 USB prt 3.0 m white GB117.0023 %€ 17.00"
   *
   * @param {string} line - A cleaned receipt line
   * @returns {boolean} True if this looks like an IKEA article number line
   */
  isIkeaProductLine(line) {
    return /^\d{3}\.\d{3}\.\d{2,3}/.test(line);
  }

  /**
   * Strips article number and embedded data from an IKEA product line.
   * Extracts just the human-readable product name and the final price.
   *
   * Input:  "702.809.93KOPPLA socket 3-w w 2 USB prt 3.0 m white GB117.0023 %€ 17.00"
   * Output: { description: "KOPPLA socket 3-w w 2 USB prt 3.0 m white GB", price: 17.00 }
   *
   * @param {string} line - A raw IKEA product line
   * @returns {{description: string, price: number}} Cleaned product info
   */
  parseIkeaProductLine(line) {
    let price = 0;
    const finalPriceMatch = line.match(/[€£$]\s*(\d{1,6}[.,]\d{2})\s*$/);
    if (finalPriceMatch) {
      price = parseFloat(finalPriceMatch[1].replace(',', '.'));
    }

    let description = line.replace(/^\d{3}\.\d{3}\.\d{2,3}/, '').trim();
    description = description.replace(/[€£$]\s*\d{1,6}[.,]\d{2}\s*$/, '').trim();
    description = description.replace(/\s*\d{1,2}\s*%\s*$/, '').trim();
    description = description.replace(/\s*\d{1,6}[.,]\d{2}\s*$/, '').trim();
    description = description.replace(/\s+\d{1,3}$/, '').trim();

    return { description, price };
  }

  /**
   * Parses a generic invoice product line (non-IKEA format).
   *
   * Generic invoice lines have a multi-column format where the last column
   * is often a tax amount, not the actual item price. The format is typically:
   *   ProductName [SKU: xxx] Quantity UnitPrice €TotalPrice €TaxAmount
   *
   * Example (Fanatec):
   *   "CSL Steering Wheel SPARCO® GT SKU: SW_CSL_SP_GT 1 229.95 €229.95 €43.00"
   *   → description: "CSL Steering Wheel SPARCO® GT"
   *   → price: 229.95 (second-to-last euro-signed price, not the tax at the end)
   *
   * Strategy:
   * 1. Extract all euro-signed prices from the line
   * 2. If there are 2+ euro prices, the last is likely tax — use the second-to-last
   * 3. If there is 1 euro price, use it directly
   * 4. Strip SKU/barcode/reference metadata from the description
   *
   * @param {string} line - A raw invoice product line
   * @returns {{description: string, price: number}} Cleaned product info
   */
  parseGenericInvoiceLine(line) {
    // Find all euro-signed prices in the line e.g. ["€229.95", "€43.00"]
    const allEuroPrices = [...line.matchAll(/[€£$]\s*(\d{1,6}[.,]\d{2})/g)];

    let price = 0;
    if (allEuroPrices.length >= 2) {
      // Two or more euro prices: the last is typically tax, use second-to-last
      const targetMatch = allEuroPrices[allEuroPrices.length - 2];
      price = parseFloat(targetMatch[1].replace(',', '.'));
    } else if (allEuroPrices.length === 1) {
      price = parseFloat(allEuroPrices[0][1].replace(',', '.'));
    }

    // Build a clean description by removing trailing numeric columns
    let description = line;

    // Remove all trailing euro-signed prices (e.g. "€229.95 €43.00" at the end)
    description = description.replace(/(?:\s*[€£$]\s*\d{1,6}[.,]\d{2})+\s*$/, '').trim();

    // Remove trailing VAT/tax percentage e.g. "23 %"
    description = description.replace(/\s*\d{1,2}\s*%\s*$/, '').trim();

    // Remove trailing non-euro price numbers (plain unit prices like "229.95")
    description = description.replace(/\s*\d{1,6}[.,]\d{2}\s*$/, '').trim();

    // Remove trailing standalone quantity integer e.g. "1"
    description = description.replace(/\s+\d{1,3}$/, '').trim();

    // Strip SKU/barcode/reference metadata anywhere in the description
    // e.g. "CSL Steering Wheel SPARCO® GT SKU: SW_CSL_SP_GT" → "CSL Steering Wheel SPARCO® GT"
    description = description.replace(/\s*sku\s*:\s*\S+/gi, '').trim();
    description = description.replace(/\s*ref\s*:\s*\S+/gi, '').trim();
    description = description.replace(/\s*barcode\s*:\s*\S+/gi, '').trim();
    description = description.replace(/\s*art\s*\.?\s*no\.?\s*:\s*\S+/gi, '').trim();

    return { description, price };
  }

  /**
   * Applies a quality check to the extracted items list.
   *
   * If more than half the extracted items have price = 0, OCR likely picked
   * up metadata rather than real products. In that case collapse to a single
   * placeholder so the user gets a clean form rather than a list of wrong items.
   *
   * Also filters out individual zero-price lines that match metadata patterns
   * (sizes, discount labels, percentage lines, product code prefixes).
   *
   * @param {Array} items - Array of extracted items
   * @param {boolean} isInvoice - Whether this is an invoice document
   * @returns {Array} Original items if quality is good, or a single placeholder
   */
  applyQualityFallback(items, isInvoice) {
    // Invoice PDFs have reliable extraction, trust them even with some zero-price items
    if (isInvoice) return items;

    const zeroPriceCount = items.filter(item => !item.price || item.price === 0).length;
    const totalItems = items.length;

    // If more than half the items have no price, collapse to single placeholder
    if (totalItems > 1 && zeroPriceCount > totalItems / 2) {
      console.log(`Quality fallback: ${zeroPriceCount}/${totalItems} items have no price. Collapsing to placeholder.`);
      return [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }];
    }

    // Filter out zero-price items that match known metadata patterns
    const metadataPatterns = [
      /^size\s*:/i,
      /^colour\s*:/i,
      /^color\s*:/i,
      /^style\s*:/i,
      /^\(p\)\s/i,
      /^\d+%/,
      /^ref\s*:/i,
      /^sku\s*:/i,
      /^barcode/i,
      /student card/i,
      /loyalty card/i,
      /discount/i,
    ];

    const filteredItems = items.filter(item => {
      if (item.price && item.price > 0) return true;
      const isMetadata = metadataPatterns.some(p => p.test(item.productDescription));
      if (isMetadata) {
        console.log(`  Quality filter: removed metadata item "${item.productDescription}"`);
        return false;
      }
      return true;
    });

    if (filteredItems.length === 0) {
      return [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }];
    }

    return filteredItems;
  }

  /**
   * Parses raw OCR text to extract structured receipt information.
   *
   * @param {string} text - Raw OCR text
   * @returns {Object} Structured receipt data with items array
   */
  parseReceiptText(text) {
    console.log('Parsing receipt text...');

    const lines = this.getCleanLines(text);
    const isInvoice = this.isInvoiceDocument(lines);

    const storeName = this.extractStoreName(text);
    const purchaseDate = this.extractDate(text);
    const rawItems = this.extractItems(text, isInvoice);
    const items = this.applyQualityFallback(rawItems, isInvoice);

    console.log(`Quality check: ${rawItems.length} raw items → ${items.length} after quality filter`);

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

    const data = { storeName, purchaseDate, items, totalPrice, warrantyMonths, confidence };
    console.log('Parsed receipt data:', JSON.stringify(data, null, 2));
    return data;
  }

  /**
   * Extracts store name from receipt text.
   *
   * Strategy 1 (IKEA-style invoices):
   * Looks BACKWARDS from "Seller:" label to find the company name.
   * The seller name appears above the label in PDF text extraction.
   *
   * Strategy 2 (Generic invoices e.g. Fanatec):
   * Looks FORWARD from "Supplier" or "Vendor:" label to find the company name.
   * The company name appears on the lines after the label.
   *
   * Strategy 3 (Till receipts):
   * Looks in the first 8 lines, skipping page headers and noise.
   *
   * @param {string} text - Receipt text
   * @returns {string} Store name or 'Unknown Store'
   */
  extractStoreName(text) {
    const lines = this.getCleanLines(text);

    // Strategy 1: IKEA-style — look BACKWARDS from "Seller:" label
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().trim() === 'seller:') {
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
          const candidate = lines[j].trim();
          if (
            candidate.length >= 3 &&
            !candidate.toLowerCase().startsWith('vat') &&
            !this.isAddressLine(candidate) &&
            !candidate.match(/^\d/) &&
            !candidate.includes('"')
          ) {
            console.log(`Found seller name before "Seller:" label: "${candidate}"`);
            return candidate.substring(0, 80);
          }
        }
      }
    }

    // Strategy 2: Generic invoice — look FORWARD from "Supplier" or "Vendor:" label
    // The company name appears on the lines immediately after the label.
    const supplierLabels = ['supplier', 'vendor:', 'sold by:'];
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase().trim();
      if (supplierLabels.some(label => lower === label || lower.startsWith(label))) {
        // Search the next few lines for the company name
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const candidate = lines[j].trim();
          if (
            candidate.length >= 3 &&
            !candidate.toLowerCase().startsWith('vat') &&
            !this.isAddressLine(candidate) &&
            !candidate.match(/^\d/) &&
            !candidate.includes(':')   // Skip lines like "VAT Registration number: ..."
          ) {
            console.log(`Found supplier name after "${lines[i]}" label: "${candidate}"`);
            return candidate.substring(0, 80);
          }
        }
      }
    }

    // Strategy 3: For till receipts — look in the first 8 lines.
    // Expanded noise list to also skip Fanatec/generic invoice header lines.
    const pageHeaderNoise = [
      'page ', 'invoice', 'receipt', 'order confirmation', 'tax invoice',
      'issue date', 'invoice no', 'invoice:', 'client', 'supplier',
      'amount due', 'amount paid', 'f1', 'order date'
    ];

    for (const line of lines.slice(0, 8)) {
      if (line.match(/\d{3,}/)) continue;
      if (line.length > 60) continue;
      if (this.isFooterLine(line)) continue;
      if (this.isAddressLine(line)) continue;
      if (pageHeaderNoise.some(n => line.toLowerCase().startsWith(n))) continue;

      const letterCount = (line.match(/[a-zA-Z]/g) || []).length;
      if (letterCount >= 3) {
        return line.substring(0, 80);
      }
    }

    return 'Unknown Store';
  }

  /**
   * Extracts purchase date from receipt text.
   * Tries multiple common date formats used on receipts and invoices.
   *
   * @param {string} text - Receipt text
   * @returns {string} Date in YYYY-MM-DD format, or today's date if not found
   */
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
        if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
          return parsed.toISOString().split('T')[0];
        }
      } catch (err) {
        console.log('Date parse error:', err.message);
      }
    }

    return new Date().toISOString().split('T')[0];
  }

  /**
   * Extracts multiple line items from receipt text.
   *
   * Three item parsing paths depending on document type:
   *
   * 1. IKEA product lines (start with article number digits.digits.digits):
   *    Uses parseIkeaProductLine() to strip article number and column data.
   *
   * 2. Generic invoice lines (non-IKEA invoice format e.g. Fanatec):
   *    Uses parseGenericInvoiceLine() which handles multi-column layouts where
   *    the last column is often a tax amount rather than the item price.
   *
   * 3. Till receipt lines:
   *    Standard end-of-line price extraction with keyword filtering.
   *
   * CRITICAL check ordering inside the loop:
   * 1. Hard stop keywords
   * 2. Column sub-headers (before soft stops to avoid false "total" matches)
   * 3. Soft stop keywords
   * 4. Filter checks
   * 5. Price/description extraction
   *
   * @param {string} text - Receipt text
   * @param {boolean} isInvoice - Whether this is an invoice document (pre-computed)
   * @returns {Array} Array of {productDescription, price, warrantyMonths}
   */
  extractItems(text, isInvoice) {
    const lines = this.getCleanLines(text);
    const items = [];

    // Hard stop: always ends the product section
    const hardStopKeywords = [
      'subtotal', 'sub-total', 'amount due', 'balance due',
      'grand total', 'vat specification', 'payment details',
      'payment type', 'net amount'
    ];

    // Soft stop: ends extraction only when line STARTS with keyword
    const softStopKeywords = ['total', 'goods', 'services'];

    // Column sub-header lines in invoice tables.
    // MUST be checked before softStopKeywords — "Total Price VAT" starts with "total"
    const columnSubHeaders = [
      'original price', 'vat included', 'vat rate', 'total price vat',
      'included', 'unit price', 'line total', 'excl. vat', 'incl. vat',
      'tax amount', 'unit price incl. tax'
    ];

    // Lines that are definitely not products
    const skipKeywords = [
      'order', 'receipt', 'invoice', 'customer', 'cashier', 'assistant',
      'served by', 'transaction', 'store', 'branch',
      'qty', 'quantity', 'amount', 'payment', 'cash',
      'change', 'paid', 'tel', 'phone', 'email', 'barcode',
      'size', 'colour', 'color', 'style no', 'style:',
      'less discount', 'student card', 'loyalty card',
      'art. no', 'buyer', 'seller', 'supplier', 'client',
      'invoice details', 'order date', 'invoice date', 'delivery date',
      'delivery address', 'billing address', 'ship to', 'bill to',
      'page ', 'collection date', 'order number', 'invoice number',
      'issue date', 'invoice no', 'invoice:',
      'reference', 'pan seq', 'pref. name', 'card type', 'entry mode',
      'auth code', 'till location', 'receipt no', 'transaction id',
      'merchant id', 'how was it', '** sale **',
      'standard delivery', 'express delivery', 'next day delivery',
      'vat registration', 'vat number', 'reg no'
    ];

    const endPricePattern = /[€£$]?\s*(\d{1,6}[.,]\d{2})\s*$/;

    // Determine start index
    let startIndex = 4;

    if (isInvoice) {
      const tableStart = this.findProductTableStart(lines);
      if (tableStart !== -1) {
        startIndex = tableStart;
        console.log(`Invoice detected. Starting item extraction at line ${startIndex}`);
      } else {
        console.log('Invoice detected but no table header found. Using default start.');
      }
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase().trim();

      // ── 1. Hard stop ───────────────────────────────────────────────────
      if (hardStopKeywords.some(kw => lower.includes(kw))) break;

      // ── 2. Column sub-headers (BEFORE soft stops) ──────────────────────
      if (columnSubHeaders.some(kw => lower === kw || lower.startsWith(kw + ' '))) continue;

      // ── 3. Soft stop ───────────────────────────────────────────────────
      if (softStopKeywords.some(kw => lower.startsWith(kw))) break;

      // ── 4. Filter checks ───────────────────────────────────────────────
      if (this.isFooterLine(line)) continue;
      if (this.isAddressLine(line)) continue;
      if (skipKeywords.some(kw => lower.startsWith(kw))) continue;
      if (skipKeywords.some(kw => lower === kw)) continue;
      if (/^[\d\s\.,€£$\-]+$/.test(line)) continue;
      if (line.length < 4) continue;

      const letterCount = (line.match(/[a-zA-Z]/g) || []).length;
      if (letterCount < 3) continue;

      // ── 5. Extract product description and price ───────────────────────
      let productDescription = '';
      let price = 0;

      if (isInvoice && this.isIkeaProductLine(line)) {
        // Path A: IKEA article-number line
        const parsed = this.parseIkeaProductLine(line);
        productDescription = parsed.description;
        price = parsed.price;

      } else if (isInvoice) {
        // Path B: Generic invoice line (Fanatec etc.)
        // Use the multi-column parser that handles tax-amount columns
        const parsed = this.parseGenericInvoiceLine(line);
        productDescription = parsed.description;
        price = parsed.price;

      } else {
        // Path C: Standard till receipt line
        const priceMatch = line.match(endPricePattern);
        if (priceMatch) {
          price = parseFloat(priceMatch[1].replace(',', '.'));
        } else if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextPriceMatch = nextLine.match(/^[€£$]?\s*(\d{1,6}[.,]\d{2})\s*$/);
          if (nextPriceMatch) {
            price = parseFloat(nextPriceMatch[1].replace(',', '.'));
          }
        }
        productDescription = line.replace(endPricePattern, '').trim();
      }

      if (!productDescription || productDescription.length < 3) continue;

      items.push({
        productDescription: productDescription.substring(0, 200),
        price: isNaN(price) ? 0 : price,
        warrantyMonths: 12
      });
    }

    if (items.length === 0) {
      items.push({ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 });
    }

    console.log(`Extracted ${items.length} raw item(s) from receipt`);
    return items;
  }

  /**
   * Extracts the invoice/receipt total price from the text.
   *
   * Priority order:
   * 1. "Invoice Total" (IKEA format) — takes the last price on the line
   * 2. "Total Incl. Tax" / "Total Including Tax" — preferred for tax-inclusive total
   * 3. Lines starting with "Total" — generic total
   * 4. Till receipt patterns (Amount Due, Balance Due, Grand Total)
   * 5. Largest price on receipt as a last resort
   *
   * NOTE: "Total Excl. Tax" is intentionally NOT matched in early strategies
   * because it represents the pre-tax total, not what the customer paid.
   *
   * @param {string} text - Receipt text
   * @returns {number} Total price as a float, or 0.00 if not found
   */
  extractTotalPrice(text) {
    const lines = this.getCleanLines(text);

    for (const line of lines) {
      const lower = line.toLowerCase();

      // Strategy 1: "Invoice Total" — IKEA format, take the LAST price on line
      if (lower.includes('invoice total')) {
        const allPricesOnLine = [...line.matchAll(/[€£$]\s*(\d{1,6}[.,]\d{2})/g)];
        if (allPricesOnLine.length > 0) {
          const lastMatch = allPricesOnLine[allPricesOnLine.length - 1];
          const price = parseFloat(lastMatch[1].replace(',', '.'));
          if (!isNaN(price) && price > 0) {
            console.log('Found invoice total:', price);
            return price;
          }
        }
      }

      // Strategy 2: "Total Incl. Tax" or "Total Including Tax" — generic invoices.
      // This is checked BEFORE the generic "total" strategy below to ensure we
      // capture the tax-inclusive total rather than the exclusive one.
      if (lower.includes('total incl') || lower.includes('total including')) {
        const priceMatch = line.match(/[€£$]\s*(\d{1,6}[.,]\d{2})/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1].replace(',', '.'));
          if (!isNaN(price) && price > 0) {
            console.log('Found total incl. tax:', price);
            return price;
          }
        }
      }

      // Strategy 3: "Amount Paid" — also represents the actual paid total
      if (lower.includes('amount paid')) {
        const priceMatch = line.match(/[€£$]\s*(\d{1,6}[.,]\d{2})/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1].replace(',', '.'));
          if (!isNaN(price) && price > 0) {
            console.log('Found amount paid:', price);
            return price;
          }
        }
      }

      // Strategy 4: line starts with "total" (but NOT "total excl" — that's pre-tax)
      if (lower.startsWith('total') && !lower.includes('excl') && !lower.includes('excluding')) {
        const priceMatch = line.match(/[€£$]?\s*(\d{1,6}[.,]\d{2})/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1].replace(',', '.'));
          if (!isNaN(price) && price > 0) {
            console.log('Found total line price:', price);
            return price;
          }
        }
      }

      // Strategy 5: explicit till receipt total patterns
      const tillTotalPatterns = [
        /amount\s+(?:due|tendered)[^a-z]*[€£$]?\s*(\d{1,6}[.,]\d{2})/i,
        /balance\s+due[^a-z]*[€£$]?\s*(\d{1,6}[.,]\d{2})/i,
        /grand\s+total[^a-z]*[€£$]?\s*(\d{1,6}[.,]\d{2})/i
      ];

      for (const pattern of tillTotalPatterns) {
        const match = line.match(pattern);
        if (match) {
          const price = parseFloat(match[1].replace(',', '.'));
          if (!isNaN(price) && price > 0) {
            console.log('Found total price (till pattern):', price);
            return price;
          }
        }
      }
    }

    // Fallback: largest price on the receipt
    const allPriceMatches = text.match(/[€£$]?\s*(\d{1,6}[.,]\d{2})/g) || [];
    const allPrices = allPriceMatches
      .map(p => parseFloat(p.replace(/[^\d.,]/g, '').replace(',', '.')))
      .filter(p => !isNaN(p) && p > 0 && p < 100000);

    if (allPrices.length > 0) {
      const maxPrice = Math.max(...allPrices);
      console.log('Fallback: largest price found:', maxPrice);
      return maxPrice;
    }

    return 0.00;
  }

  /**
   * Extracts warranty duration from receipt text.
   * Looks for mentions of "warranty" or "guarantee" followed by a time period.
   *
   * @param {string} text - Receipt text
   * @returns {number} Warranty duration in months (defaults to 12 if not found)
   */
  extractWarranty(text) {
    const warrantyPatterns = [
      /(\d+)\s*(?:year|yr)s?\s*warranty/i,
      /warranty[\s:]+(\d+)\s*(?:month|mo)s?/i,
      /warranty[\s:]+(\d+)\s*(?:year|yr)s?/i,
      /(\d+)\s*(?:month|mo)s?\s*guarantee/i,
      /(\d+)\s*(?:year|yr)s?\s*guarantee/i,
      /guarantee[\s:]+(\d+)\s*(?:month|mo)s?/i
    ];

    for (const pattern of warrantyPatterns) {
      const match = text.match(pattern);
      if (match) {
        const duration = parseInt(match[1]);
        const isYears = pattern.toString().includes('year') || pattern.toString().includes('yr');
        const months = isYears ? duration * 12 : duration;
        console.log(`Found warranty: ${duration} ${isYears ? 'years' : 'months'} = ${months} months`);
        return months;
      }
    }

    return 12;
  }

  /**
   * Returns a safe default data structure when OCR completely fails.
   *
   * @returns {Object} Default receipt data with one placeholder item
   */
  getDefaultData() {
    return {
      storeName: 'Unknown Store',
      purchaseDate: new Date().toISOString().split('T')[0],
      items: [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }],
      totalPrice: 0.00,
      warrantyMonths: 12,
      confidence: 'low'
    };
  }

  /**
   * Validates extracted data and applies business rules.
   * Ensures all values are within acceptable ranges before saving to DB.
   *
   * @param {Object} data - Extracted receipt data
   * @returns {Object} Validated and sanitised data
   */
  validateExtractedData(data) {
    if (!data.totalPrice || data.totalPrice < 0) data.totalPrice = 0;

    if (!data.warrantyMonths || data.warrantyMonths < 0 || data.warrantyMonths > 120) {
      data.warrantyMonths = 12;
    }

    const purchaseDate = new Date(data.purchaseDate);
    if (isNaN(purchaseDate.getTime()) || purchaseDate > new Date()) {
      data.purchaseDate = new Date().toISOString().split('T')[0];
    }

    if (data.storeName) {
      data.storeName = data.storeName.trim().substring(0, 100);
    }

    if (data.items && Array.isArray(data.items)) {
      data.items = data.items.map(item => ({
        productDescription: (item.productDescription || 'Receipt Item').trim().substring(0, 200),
        price: isNaN(parseFloat(item.price)) ? 0 : Math.max(0, parseFloat(item.price)),
        warrantyMonths: (!item.warrantyMonths || item.warrantyMonths < 0 || item.warrantyMonths > 120)
          ? 12
          : parseInt(item.warrantyMonths)
      }));
    } else {
      data.items = [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }];
    }

    return data;
  }
}

module.exports = { OcrService };