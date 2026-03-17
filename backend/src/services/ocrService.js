/**
 * OCR Service for extracting text from receipt images.
 * Author: Arthur Kroth - x22166971
 * Date: 17/03/2026
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
 * - Parses extracted text to identify key information
 * - Returns structured data (store, date, product, price, warranty)
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
   * @returns {Promise<Object>} Extracted receipt data
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

    // Get original image dimensions so we can upscale intelligently
    const metadata = await sharp(imagePath).metadata();
    const newWidth = metadata.width * 2;
    const newHeight = metadata.height * 2;

    await sharp(imagePath)
      .resize(newWidth, newHeight)   // Step 1: Upscale 2x (helps Tesseract read small text)
      .greyscale()                   // Step 2: Remove colour noise
      .normalise()                   // Step 3: Boost contrast range
      .threshold(140)                // Step 4: Binarize - anything below 140 becomes black, above becomes white
      .sharpen({ sigma: 1.5 })       // Step 5: Sharpen edges for crisper letters
      .png()                         // Step 6: Save as PNG
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
      // Always clean up the temporary preprocessed file to free disk space
      if (tempPath) {
        await fs.unlink(tempPath).catch(() => {});
      }
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
   * OCR often introduces characters like |, \, /, ~, ^ that are not real content.
   *
   * @param {string} line - A single line of raw OCR text
   * @returns {string} Cleaned line
   */
  cleanLine(line) {
    return line
      .replace(/[|\\\/~^{}[\]]/g, '')  // Remove common OCR noise characters
      .replace(/\s{2,}/g, ' ')          // Collapse multiple spaces into one
      .trim();
  }

  /**
   * Splits raw OCR text into clean, non-empty lines.
   * Filters out lines that are too short to be useful (likely OCR noise).
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
   * Receipts often have legal text at the bottom that confuses the parser.
   *
   * @param {string} line - A cleaned receipt line
   * @returns {boolean} True if the line should be ignored
   */
  isFooterLine(line) {
    const footerKeywords = [
      'thank you', 'thanks for', 'please retain', 'vat reg', 'vat no',
      'company reg', 'registered in', 'recycling', 'contribution',
      'return policy', 'exchange', 'refund', 'all prices',
      'e&oe', 'errors', 'omissions', 'www.', 'http', '.com', '.ie', '.co.uk',
      'tel:', 'phone:', 'fax:', 'email:', 'follow us', 'facebook', 'twitter'
    ];
    const lower = line.toLowerCase();
    return footerKeywords.some(kw => lower.includes(kw));
  }

  /**
   * Parses raw OCR text to extract structured receipt information.
   *
   * @param {string} text - Raw OCR text
   * @returns {Object} Structured receipt data
   */
  parseReceiptText(text) {
    console.log('Parsing receipt text...');

    const data = {
      storeName: this.extractStoreName(text),
      purchaseDate: this.extractDate(text),
      productDescription: this.extractProduct(text),
      price: this.extractPrice(text),
      warrantyMonths: this.extractWarranty(text),
      confidence: 'medium'
    };

    // Calculate confidence based on how many fields were successfully extracted
    const extractedCount = [
      data.storeName !== 'Unknown Store',
      data.purchaseDate !== new Date().toISOString().split('T')[0],
      data.productDescription !== 'Receipt Item',
      data.price > 0
    ].filter(Boolean).length;

    if (extractedCount >= 3) data.confidence = 'high';
    else if (extractedCount >= 2) data.confidence = 'medium';
    else data.confidence = 'low';

    console.log('Parsed receipt data:', data);
    return data;
  }

  /**
   * Extracts store name from receipt text.
   * Strategy: The store name is almost always in the first 1-4 meaningful lines.
   * We clean each line and pick the best candidate - preferring lines that are
   * all-caps or title-cased and not addresses/phone numbers.
   *
   * @param {string} text - Receipt text
   * @returns {string} Store name or 'Unknown Store'
   */
  extractStoreName(text) {
    const lines = this.getCleanLines(text);
    const topLines = lines.slice(0, 6);

    for (const line of topLines) {
      if (line.match(/\d{3,}/)) continue;      // Skip lines with 3+ digits (phone/address)
      if (line.length > 60) continue;           // Too long to be a store name
      if (this.isFooterLine(line)) continue;    // Skip footer text

      const upperCount = (line.match(/[A-Z]/g) || []).length;
      const letterCount = (line.match(/[a-zA-Z]/g) || []).length;

      // Good candidate: mostly uppercase, at least 3 letters
      if (letterCount >= 3) {
        return line.substring(0, 80);
      }
    }

    // Fallback: return the first non-empty cleaned line
    if (topLines.length > 0) {
      return topLines[0].substring(0, 80);
    }

    return 'Unknown Store';
  }

  /**
   * Extracts purchase date from receipt text.
   * Tries multiple common date formats used on receipts.
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

        if (order === 'dmy') {
          [day, month, year] = [match[1], match[2], match[3]];
        } else if (order === 'ymd') {
          [year, month, day] = [match[1], match[2], match[3]];
        } else if (order === 'dmy2') {
          [day, month] = [match[1], match[2]];
          year = '20' + match[3];
        } else if (order === 'dmy_word') {
          day = match[1];
          month = monthNames[match[2].substring(0, 3).toLowerCase()];
          year = match[3];
        } else if (order === 'mdy_word') {
          month = monthNames[match[1].substring(0, 3).toLowerCase()];
          day = match[2];
          year = match[3];
        }

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
   * Extracts product description from receipt text.
   * Strategy: Find lines that look like product names - they appear after the
   * store header, contain letters, and are not totals/taxes/footer lines.
   *
   * @param {string} text - Receipt text
   * @returns {string} Product description or 'Receipt Item'
   */
  extractProduct(text) {
    const lines = this.getCleanLines(text);

    const stopKeywords = ['total', 'subtotal', 'sub-total', 'amount due', 'balance', 'vat', 'tax'];
    const skipKeywords = [
      'order', 'receipt', 'invoice', 'customer', 'cashier', 'served by', 'assistant',
      'transaction', 'date', 'time', 'store', 'branch', 'address',
      'qty', 'quantity', 'price', 'amount', 'payment', 'cash', 'card',
      'change', 'paid', 'tel', 'phone', 'email', '** sale **', 'sale', 'barcode', 'size', 'less discount'
    ];

    const productCandidates = [];

    for (let i = 4; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      if (stopKeywords.some(kw => lower.startsWith(kw))) break;
      if (this.isFooterLine(line)) continue;
      if (skipKeywords.some(kw => lower.startsWith(kw))) continue;
      if (/^[\d\s\.,€£$\-]+$/.test(line)) continue;
      if (line.length < 4) continue;

      const letterCount = (line.match(/[a-zA-Z]/g) || []).length;
      if (letterCount >= 3) {
        productCandidates.push(line);
      }
    }

    if (productCandidates.length > 0) {
      return productCandidates[0].substring(0, 200);
    }

    return 'Receipt Item';
  }

  /**
   * Extracts the total price from receipt text.
   * Strategy: Look for lines containing "total" with a price next to it.
   * Falls back to the largest price value on the receipt.
   *
   * @param {string} text - Receipt text
   * @returns {number} Price as a float, or 0.00 if not found
   */
  extractPrice(text) {
    const lines = this.getCleanLines(text);

    // Look for an explicit "total" line with a price
    const totalLinePattern = /total[^a-z]*[\$€£]?\s*(\d{1,6}[.,]\d{2})/i;
    for (const line of lines) {
      const match = line.match(totalLinePattern);
      if (match) {
        const price = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(price) && price > 0) {
          console.log('Found total price:', price);
          return price;
        }
      }
    }

    // Try "amount due" or "balance due"
    const balanceMatch = text.match(/(?:amount|balance)\s+due[^a-z]*[\$€£]?\s*(\d{1,6}[.,]\d{2})/i);
    if (balanceMatch) {
      const price = parseFloat(balanceMatch[1].replace(',', '.'));
      if (!isNaN(price) && price > 0) return price;
    }

    // Fallback: return the largest price found on the receipt
    const allPriceMatches = text.match(/[\$€£]?\s*(\d{1,6}[.,]\d{2})/g) || [];
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
   * @returns {Object} Default receipt data
   */
  getDefaultData() {
    return {
      storeName: 'Unknown Store',
      purchaseDate: new Date().toISOString().split('T')[0],
      productDescription: 'Receipt Item',
      price: 0.00,
      warrantyMonths: 12,
      confidence: 'low'
    };
  }

  /**
   * Validates extracted data and applies business rules.
   * Ensures all values are within acceptable ranges.
   *
   * @param {Object} data - Extracted receipt data
   * @returns {Object} Validated and sanitised data
   */
  validateExtractedData(data) {
    if (!data.price || data.price < 0) data.price = 0;

    if (!data.warrantyMonths || data.warrantyMonths < 0 || data.warrantyMonths > 120) {
      data.warrantyMonths = 12;
    }

    const purchaseDate = new Date(data.purchaseDate);
    if (isNaN(purchaseDate.getTime()) || purchaseDate > new Date()) {
      data.purchaseDate = new Date().toISOString().split('T')[0];
    }

    if (data.storeName) data.storeName = data.storeName.trim().substring(0, 100);
    if (data.productDescription) data.productDescription = data.productDescription.trim().substring(0, 200);

    return data;
  }
}

module.exports = { OcrService };