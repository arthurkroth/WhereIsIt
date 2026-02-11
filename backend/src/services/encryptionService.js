/**
 * Encryption Service for field-level AES-256-GCM encryption and decryption.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */


const crypto = require("crypto");
const { env } = require("../config/env");

/**
 * AES-256-GCM field encryption.
 * Output: base64(iv + tag + ciphertext)
 */
class EncryptionService {
  constructor() {
    const keyBytes = Buffer.from(env.encryption.fieldKeyBase64, "base64");
    if (keyBytes.length !== 32) {
      throw new Error("FIELD_ENC_KEY_BASE64 must decode to 32 bytes for AES-256-GCM");
    }
    this.key = keyBytes;
  }

  /**
   * Encrypts sensitive fields (store name, product description).
   * @param {string} plaintext
   * @returns {string}
   */
  encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString("base64");
  }

  /**
   * Decrypts the base64 payload produced by encrypt().
   * @param {string} payloadBase64
   * @returns {string}
   */
  decrypt(payloadBase64) {
    const payload = Buffer.from(payloadBase64, "base64");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  }
}

module.exports = { EncryptionService };