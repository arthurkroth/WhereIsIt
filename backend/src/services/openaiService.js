/**
 * OCR Service for extracting text from documents using OpenAI GPT-4o-mini.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Premium OCR service using OpenAI GPT-4o-mini.
 * Used exclusively for Premium users — Free users use Tesseract (ocrService.js).
 *
 * STRATEGY:
 * - Images (JPEG, PNG): sent directly to GPT-4o-mini Vision API as base64
 * - PDFs: text extracted with pdf-parse first, then sent to GPT-4o-mini as text
 *
 * GPT-4o-mini provides significantly better accuracy than Tesseract for challenging receipts, especially:
 * - Handwritten receipts
 * - Low-quality scans
 * - Complex multi-column invoice layouts
 * - Non-standard receipt formats
 *
 * SECURITY:
 * - API key loaded from environment variables only
 * - Receipt images are never stored externally by OpenAI (API calls are stateless)
 * - Responses are validated before use
 */

const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');

// Initialise the OpenAI client using the API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * The structured extraction prompt sent to GPT-4o-mini.
 * Instructs the model to return ONLY valid JSON — no markdown, no preamble.
 */
const EXTRACTION_PROMPT = `You are a receipt and invoice data extraction assistant for a warranty management application.
Extract the following information and return ONLY a valid JSON object — no markdown, no code fences, no explanation.

Required JSON format:
{
  "storeName": "string - merchant or store name",
  "purchaseDate": "string - date in YYYY-MM-DD format",
  "items": [
    {
      "productDescription": "string - product or item name",
      "price": number - item price as decimal (0 if unclear),
      "warrantyMonths": number - warranty in months (12 if not stated for electronics, 0 for consumables)
    }
  ],
  "totalPrice": number - total amount paid as decimal,
  "confidence": "high" or "medium" or "low"
}

Rules:
- Extract ALL line items visible on the receipt
- For totalPrice use the final amount paid (tax-inclusive if shown)
- If purchase date is unclear use today's date in YYYY-MM-DD format
- Set confidence to "high" if most fields are clearly readable
- Set confidence to "medium" if some fields are partially unclear
- Set confidence to "low" if the image is poor quality or many fields are missing
- Return ONLY the JSON object, nothing else`;

/**
 * Processes a receipt file using OpenAI GPT-4o-mini.
 * Routes to Vision API for images or text API for PDFs.
 *
 * @param {string} filePath - Absolute path to the uploaded receipt file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<Object>} Structured receipt data with items array
 */
async function processReceiptWithOpenAI(filePath, mimeType) {
  try {
    console.log('OpenAI Premium OCR: processing', filePath);

    let extractedData;

    if (mimeType === 'application/pdf') {
      extractedData = await processPdfWithOpenAI(filePath);
    } else if (mimeType.startsWith('image/')) {
      extractedData = await processImageWithOpenAI(filePath, mimeType);
    } else {
      throw new Error('Unsupported file type for OpenAI processing');
    }

    const validated = validateOpenAIResponse(extractedData);

    console.log('OpenAI extraction complete. Confidence:', validated.confidence);
    return { success: true, extractedData: validated, confidence: validated.confidence };

  } catch (error) {
    console.error('OpenAI OCR error:', error.message);
    return {
      success: false,
      error: error.message,
      extractedData: getDefaultData()
    };
  }
}

/**
 * Sends a receipt image to GPT-4o-mini Vision API as base64.
 * Converts the image to base64 and includes it in the API request alongside
 * the extraction prompt.
 *
 * @param {string} imagePath - Path to the image file
 * @param {string} mimeType - Image MIME type (image/jpeg, image/png)
 * @returns {Promise<Object>} Parsed JSON response from GPT-4o-mini
 */
async function processImageWithOpenAI(imagePath, mimeType) {
  // Read image as base64
  const imageBuffer = await fs.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: 'high'  // Use high detail for better OCR accuracy
            }
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT
          }
        ]
      }
    ],
    max_tokens: 1500
  });

  const rawContent = response.choices[0].message.content;
  console.log('OpenAI Vision raw response (first 200 chars):', rawContent.substring(0, 200));

  return parseOpenAIResponse(rawContent);
}

/**
 * Extracts text from a PDF using pdf-parse, then sends it to GPT-4o-mini
 * for structured data extraction.
 * PDFs cannot be sent as images, so text extraction is needed first.
 *
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<Object>} Parsed JSON response from GPT-4o-mini
 */
async function processPdfWithOpenAI(pdfPath) {
  // Extract raw text from the PDF
  const dataBuffer = await fs.readFile(pdfPath);
  const pdfData = await pdfParse(dataBuffer);
  const rawText = pdfData.text;

  if (!rawText || rawText.trim().length < 10) {
    throw new Error('PDF appears to be image-based or empty — cannot extract text for OpenAI');
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `${EXTRACTION_PROMPT}\n\nReceipt text to analyse:\n\n${rawText.substring(0, 4000)}`
      }
    ],
    max_tokens: 1500
  });

  const rawContent = response.choices[0].message.content;
  console.log('OpenAI PDF raw response (first 200 chars):', rawContent.substring(0, 200));

  return parseOpenAIResponse(rawContent);
}

/**
 * Parses the raw string response from OpenAI into a JavaScript object.
 * Strips markdown code fences if the model included them despite instructions.
 *
 * @param {string} rawContent - Raw string from OpenAI response
 * @returns {Object} Parsed JSON object
 */
function parseOpenAIResponse(rawContent) {
  // Strip markdown code fences in case the model ignored the "no fences" instruction
  let cleaned = rawContent
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // If JSON parse fails, try to extract JSON from the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error(`OpenAI response was not valid JSON: ${cleaned.substring(0, 100)}`);
  }
}

/**
 * Validates and sanitises the parsed OpenAI response.
 * Ensures all required fields are present and within acceptable ranges.
 *
 * @param {Object} data - Parsed response from OpenAI
 * @returns {Object} Validated and sanitised receipt data
 */
function validateOpenAIResponse(data) {
  if (!data || typeof data !== 'object') {
    return getDefaultData();
  }

  // Validate and sanitise store name
  const storeName = (data.storeName || 'Unknown Store').toString().trim().substring(0, 100);

  // Validate purchase date
  let purchaseDate = new Date().toISOString().split('T')[0];
  if (data.purchaseDate) {
    const parsed = new Date(data.purchaseDate);
    if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
      purchaseDate = parsed.toISOString().split('T')[0];
    }
  }

  // Validate items array
  let items = [];
  if (Array.isArray(data.items) && data.items.length > 0) {
    items = data.items
      .map(item => ({
        productDescription: (item.productDescription || 'Receipt Item').toString().trim().substring(0, 200),
        price: isNaN(parseFloat(item.price)) ? 0 : Math.max(0, parseFloat(item.price)),
        warrantyMonths: isNaN(parseInt(item.warrantyMonths)) ? 12
          : Math.min(120, Math.max(0, parseInt(item.warrantyMonths)))
      }))
      .filter(item => item.productDescription.length >= 3);
  }

  if (items.length === 0) {
    items = [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }];
  }

  // Validate total price
  const totalPrice = isNaN(parseFloat(data.totalPrice)) ? 0 : Math.max(0, parseFloat(data.totalPrice));

  // Validate confidence
  const confidence = ['high', 'medium', 'low'].includes(data.confidence) ? data.confidence : 'medium';

  return {
    storeName,
    purchaseDate,
    items,
    totalPrice,
    warrantyMonths: items[0]?.warrantyMonths || 12,
    confidence
  };
}

/**
 * Returns safe default data when OpenAI processing fails completely.
 * @returns {Object} Default receipt data with one placeholder item
 */
function getDefaultData() {
  return {
    storeName: 'Unknown Store',
    purchaseDate: new Date().toISOString().split('T')[0],
    items: [{ productDescription: 'Receipt Item', price: 0, warrantyMonths: 12 }],
    totalPrice: 0,
    warrantyMonths: 12,
    confidence: 'low'
  };
}

module.exports = { processReceiptWithOpenAI };