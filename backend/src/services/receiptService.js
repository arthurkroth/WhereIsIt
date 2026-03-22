/**
 * Receipt Service for managing receipts with encrypted fields.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { db } = require("../config/db");
const { EncryptionService } = require("./encryptionService");

/**
 * Handling receipt database operations + field encryption.
 */
class ReceiptService {
  constructor() {
    this.enc = new EncryptionService();
  }

  /**
   * Creating a receipt record with encrypted fields.
   * @param {number} userId
   * @param {{storeName:string,purchaseDate:string,productDescription:string,pricePaid:number,warrantyMonths:number,filePath:string}} data
   * @returns {Promise<number>}
   */
  async createReceipt(userId, data) {
    const encryptedStore = this.enc.encrypt(data.storeName);
    const encryptedProduct = this.enc.encrypt(data.productDescription);

    const [result] = await db.execute(
      `INSERT INTO receipts
        (user_id, store_name_enc, purchase_date, product_desc_enc, price_paid, warranty_months, file_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, encryptedStore, data.purchaseDate, encryptedProduct, data.pricePaid, data.warrantyMonths, data.filePath]
    );

    return Number(result.insertId);
  }

  /**
   * Lists user receipts and decrypts display fields.
   * @param {number} userId
   */
  async listReceipts(userId) {
    const [rows] = await db.execute(
      "SELECT id, store_name_enc, purchase_date, product_desc_enc, price_paid, warranty_months FROM receipts WHERE user_id = ? ORDER BY id DESC",
      [userId]
    );

    return rows.map((r) => ({
      id: r.id,
      storeName: this.enc.decrypt(r.store_name_enc),
      purchaseDate: r.purchase_date,
      productDescription: this.enc.decrypt(r.product_desc_enc),
      pricePaid: r.price_paid,
      warrantyMonths: r.warranty_months,
      warrantyExpiresOn: this.computeWarrantyExpiry(r.purchase_date, r.warranty_months)
    }));
  }

  /**
   * Computes warranty expiry date (purchaseDate + months).
   * @param {string} purchaseDate
   * @param {number} warrantyMonths
   */
  computeWarrantyExpiry(purchaseDate, warrantyMonths) {
    const d = new Date(purchaseDate);
    d.setMonth(d.getMonth() + warrantyMonths);
    return d.toISOString().slice(0, 10);
  }
}

module.exports = { ReceiptService };