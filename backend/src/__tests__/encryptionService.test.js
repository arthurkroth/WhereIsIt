/**
 * Unit tests for EncryptionService (AES-256-GCM field-level encryption).
 * This service protects sensitive receipt data at rest - verifying its
 * correctness is a core security requirement of the project.
 */

// Provide the required env var before loading the module
process.env.FIELD_ENC_KEY_BASE64 = Buffer.from('a'.repeat(32)).toString('base64');

const { EncryptionService } = require('../services/encryptionService');

describe('EncryptionService', () => {
  let enc;

  beforeEach(() => {
    enc = new EncryptionService();
  });

  test('encrypts a plain-text string and returns a non-empty ciphertext', () => {
    const cipher = enc.encrypt('IKEA');
    expect(cipher).toBeTruthy();
    expect(cipher).not.toEqual('IKEA');
  });

  test('decrypt recovers the original plain-text after encrypt', () => {
    const original = 'Currys PC World';
    const cipher = enc.encrypt(original);
    expect(enc.decrypt(cipher)).toBe(original);
  });

  test('encrypting the same value twice produces different ciphertexts (random IV)', () => {
    const cipher1 = enc.encrypt('Apple Store');
    const cipher2 = enc.encrypt('Apple Store');
    expect(cipher1).not.toEqual(cipher2);
  });

  test('both ciphertexts still decrypt to the same original value', () => {
    const cipher1 = enc.encrypt('Apple Store');
    const cipher2 = enc.encrypt('Apple Store');
    expect(enc.decrypt(cipher1)).toBe('Apple Store');
    expect(enc.decrypt(cipher2)).toBe('Apple Store');
  });

  test('handles UTF-8 / international characters correctly', () => {
    const value = 'Äpfel & Früchte — café ☕';
    expect(enc.decrypt(enc.encrypt(value))).toBe(value);
  });

  test('handles an empty string without throwing', () => {
    const cipher = enc.encrypt('');
    expect(enc.decrypt(cipher)).toBe('');
  });

  test('returns a failure sentinel (does not crash) when decrypting tampered ciphertext', () => {
    const cipher = enc.encrypt('sensitive');
    const tampered = cipher.slice(0, -4) + 'xxxx';
    // The service catches GCM auth-tag failures and returns a sentinel string
    // rather than throwing, so callers can handle gracefully.
    const result = enc.decrypt(tampered);
    expect(result).not.toBe('sensitive');
  });
});
