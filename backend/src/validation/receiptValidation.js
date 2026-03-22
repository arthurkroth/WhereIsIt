/**
 * Receipt Validation Schemas
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { z } = require("zod");

const createReceiptManualSchema = z.object({
  storeName: z.string().min(1),
  purchaseDate: z.string().min(8), //YYYY-MM-DD
  productDescription: z.string().min(1),
  pricePaid: z.number().nonnegative(),
  warrantyMonths: z.number().int().nonnegative()
});

module.exports = { createReceiptManualSchema };