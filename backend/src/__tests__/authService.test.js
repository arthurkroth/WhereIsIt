/**
 * Unit tests for AuthService JWT issuance.
 * Tests the token generation logic without requiring a database connection
 * by verifying the structure and claims of issued JWTs.
 */

process.env.JWT_SECRET = 'test-secret-for-unit-tests-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ADMIN_JWT_EXPIRES_IN = '30m';
// Provide dummy required env vars so env.js loads without throwing
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.FIELD_ENC_KEY_BASE64 = Buffer.from('a'.repeat(32)).toString('base64');
process.env.RESEND_API_KEY = 'test';
process.env.EMAIL_FROM_ADDRESS = 'test@test.com';
process.env.APP_BASE_URL = 'http://localhost:3000';

const jwt = require('jsonwebtoken');

// Load AuthService after env vars are set
const { AuthService } = require('../services/authService');

describe('AuthService.issueJwt', () => {
  const authService = new AuthService();

  const freeUser   = { id: 1, role: 'FREE',    firstName: 'Alice', lastName: 'Smith' };
  const premUser   = { id: 2, role: 'PREMIUM', firstName: 'Bob',   lastName: 'Jones' };
  const adminUser  = { id: 3, role: 'ADMIN',   firstName: 'Carol', lastName: 'White' };

  test('returns a string with three dot-separated segments (valid JWT format)', () => {
    const token = authService.issueJwt(freeUser);
    expect(token.split('.')).toHaveLength(3);
  });

  test('JWT payload contains the correct userId, role, and name fields', () => {
    const token = authService.issueJwt(freeUser);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe(1);
    expect(decoded.role).toBe('FREE');
    expect(decoded.firstName).toBe('Alice');
    expect(decoded.lastName).toBe('Smith');
  });

  test('JWT for FREE user has an exp claim set ~1 hour in the future', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = authService.issueJwt(freeUser);
    const { exp } = jwt.verify(token, process.env.JWT_SECRET);
    const after = Math.floor(Date.now() / 1000);
    expect(exp).toBeGreaterThan(before + 3500);  // at least 58 min
    expect(exp).toBeLessThanOrEqual(after + 3601); // at most 60 min + 1s
  });

  test('JWT for ADMIN user has a shorter exp (~30 min, not 1 hour)', () => {
    const tokenAdmin = authService.issueJwt(adminUser);
    const tokenFree  = authService.issueJwt(freeUser);
    const adminExp = jwt.verify(tokenAdmin, process.env.JWT_SECRET).exp;
    const freeExp  = jwt.verify(tokenFree,  process.env.JWT_SECRET).exp;
    expect(adminExp).toBeLessThan(freeExp);
  });

  test('PREMIUM user gets the same expiry as FREE (not the shorter admin window)', () => {
    const tokenPrem = authService.issueJwt(premUser);
    const tokenFree = authService.issueJwt(freeUser);
    const premExp = jwt.verify(tokenPrem, process.env.JWT_SECRET).exp;
    const freeExp = jwt.verify(tokenFree, process.env.JWT_SECRET).exp;
    // Allow a 2-second drift between the two calls
    expect(Math.abs(premExp - freeExp)).toBeLessThanOrEqual(2);
  });

  test('token cannot be decoded with a wrong secret', () => {
    const token = authService.issueJwt(freeUser);
    expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
  });
});
