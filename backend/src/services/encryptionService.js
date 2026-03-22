/**
 * Encryption Service for field-level AES-256-GCM encryption and decryption.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */


/**
 * Encryption Service for Sensitive Data
 * Uses AES-256-GCM for field-level encryption
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const crypto = require('crypto');

/**
 * EncryptionService class handles encryption and decryption of sensitive data.
 * 
 * SECURITY FEATURES:
 * - AES-256-GCM algorithm (authenticated encryption)
 * - Unique IV (initialization vector) for each encryption
 * - Authentication tag validation on decryption
 * - Key derivation from environment variable
 * 
 * USAGE:
 * const encryption = new EncryptionService();
 * const encrypted = encryption.encrypt('sensitive data');
 * const decrypted = encryption.decrypt(encrypted);
 */
class EncryptionService {
  constructor() {
    // Get encryption key from environment or use default for development
    // IMPORTANT: In production, use a strong random key stored in .env
    const encryptionKey = process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-production-32char';
    
    // Derive a 256-bit (32-byte) key from the encryption key
    this.key = crypto.scryptSync(encryptionKey, 'salt', 32);
    
    // Algorithm to use
    this.algorithm = 'aes-256-gcm';
  }

  /**
   * Encrypts a string value.
   * Returns a base64-encoded string containing: IV:AuthTag:EncryptedData
   * 
   * @param {string} plaintext - Data to encrypt
   * @returns {string} Encrypted data (base64)
   */
  encrypt(plaintext) {
    try {
      // Generate a random IV (initialization vector) for this encryption
      const iv = crypto.randomBytes(16);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      // Encrypt the data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get the authentication tag
      const authTag = cipher.getAuthTag();
      
      // Combine IV, auth tag, and encrypted data
      // Format: IV(16 bytes):AuthTag(16 bytes):EncryptedData
      const combined = Buffer.concat([
        iv,
        authTag,
        Buffer.from(encrypted, 'hex')
      ]);
      
      // Return as base64 string
      return combined.toString('base64');
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts an encrypted string.
   * Expects format: IV:AuthTag:EncryptedData (base64)
   * 
   * @param {string} encryptedData - Encrypted data (base64)
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedData) {
    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract IV (first 16 bytes)
      const iv = combined.slice(0, 16);
      
      // Extract auth tag (next 16 bytes)
      const authTag = combined.slice(16, 32);
      
      // Extract encrypted data (remaining bytes)
      const encrypted = combined.slice(32);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      
      // Set the authentication tag
      decipher.setAuthTag(authTag);
      
      // Decrypt the data
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      // Return a placeholder if decryption fails
      // This prevents the app from crashing if encryption key changes
      return '[Decryption Failed]';
    }
  }

  /**
   * Checks if the encryption service is properly configured.
   * 
   * @returns {boolean} True if encryption is working
   */
  test() {
    try {
      const testString = 'test-data-12345';
      const encrypted = this.encrypt(testString);
      const decrypted = this.decrypt(encrypted);
      
      return testString === decrypted;
    } catch (error) {
      return false;
    }
  }
}

module.exports = { EncryptionService };