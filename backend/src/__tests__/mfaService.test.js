/**
 * Unit tests for MfaService (TOTP-based two-factor authentication).
 * Verifies that secret generation and token verification behave correctly
 * using the otplib authenticator, which is the same library used in production.
 */

const { MfaService } = require('../services/mfaService');
const { authenticator } = require('otplib');

describe('MfaService', () => {
  let mfa;

  beforeEach(() => {
    mfa = new MfaService();
  });

  test('generateSecret returns a non-empty string', () => {
    const secret = mfa.generateSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
  });

  test('generateSecret returns a valid base32 string (uppercase alphanumeric)', () => {
    const secret = mfa.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  });

  test('getOtpauthUrl returns a string starting with otpauth://', () => {
    const secret = mfa.generateSecret();
    const url = mfa.getOtpauthUrl('user@example.com', secret);
    expect(url).toMatch(/^otpauth:\/\/totp\//);
  });

  test('verifyToken returns true when the code matches the secret', () => {
    const secret = mfa.generateSecret();
    const validToken = authenticator.generate(secret);
    expect(mfa.verifyToken(secret, validToken)).toBe(true);
  });

  test('verifyToken returns false for a wrong code', () => {
    const secret = mfa.generateSecret();
    expect(mfa.verifyToken(secret, '000000')).toBe(false);
  });

  test('verifyToken returns false for a code from a different secret', () => {
    const secret1 = mfa.generateSecret();
    const secret2 = mfa.generateSecret();
    const token = authenticator.generate(secret1);
    expect(mfa.verifyToken(secret2, token)).toBe(false);
  });
});
