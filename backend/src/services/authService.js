/**
 * Authentication Service for user management and MFA.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { db } = require("../config/db");
const { MfaService } = require("./mfaService");

/**
 * AuthService
 * Handles all authentication-related business logic.
 * 
 * SECURITY FEATURES:
 * - Password hashing with bcrypt (12 rounds)
 * - JWT token generation and validation
 * - MFA support with TOTP
 * - Secure password validation
 */
class AuthService {
  constructor() {
    this.mfa = new MfaService();
  }

  /**
   * Registers a user with a hashed password.
   * @param {string} email - User email
   * @param {string} password - Plain text password
   * @param {"FREE"|"PREMIUM"} role - User role/plan
   * @returns {Promise<number>} User ID
   */
  async register(email, password, role) {
    const saltRounds = 12;
    const hash = await bcrypt.hash(password, saltRounds);

    const [result] = await db.execute(
      "INSERT INTO users (email, password_hash, role, mfa_enabled, mfa_secret) VALUES (?, ?, ?, 0, NULL)",
      [email, hash, role]
    );
    return Number(result.insertId);
  }

  /**
   * Validates credentials and returns user row if correct.
   * @param {string} email - User email
   * @param {string} password - Plain text password
   * @returns {Promise<object|null>} User object or null
   */
  async validatePassword(email, password) {
    const [rows] = await db.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
    const user = rows[0];
    if (!user) return null;

    const ok = await bcrypt.compare(password, user.password_hash);
    return ok ? user : null;
  }

  /**
   * Issues a JWT for API authentication.
   * @param {{id:number, role:string}} user - User object
   * @returns {string} JWT token
   */
  issueJwt(user) {
    return jwt.sign({ userId: user.id, role: user.role }, env.jwt.secret, {
      expiresIn: env.jwt.expiresIn
    });
  }

  /**
   * Starts MFA setup by generating and storing a secret.
   * @param {number} userId - User ID
   * @returns {Promise<object>} Setup info with secret and otpauthUrl
   */
  async beginMfaSetup(userId) {
    const [rows] = await db.execute("SELECT email FROM users WHERE id = ? LIMIT 1", [userId]);
    const email = rows[0]?.email;
    if (!email) throw new Error("User not found");

    const secret = this.mfa.generateSecret();
    const otpauthUrl = this.mfa.getOtpauthUrl(email, secret);

    await db.execute("UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?", [secret, userId]);
    return { secret, otpauthUrl };
  }

  /**
   * Confirms MFA by validating a token and enabling MFA.
   * @param {number} userId - User ID
   * @param {string} token - TOTP token
   * @returns {Promise<boolean>} True if valid
   */
  async confirmMfa(userId, token) {
    const [rows] = await db.execute("SELECT mfa_secret FROM users WHERE id = ? LIMIT 1", [userId]);
    const secret = rows[0]?.mfa_secret;
    if (!secret) return false;

    const ok = this.mfa.verifyToken(secret, token);
    if (ok) {
      await db.execute("UPDATE users SET mfa_enabled = 1 WHERE id = ?", [userId]);
    }
    return ok;
  }

  /**
   * Checks if MFA is enabled for user.
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} True if MFA enabled
   */
  async requiresMfa(userId) {
    const [rows] = await db.execute("SELECT mfa_enabled FROM users WHERE id = ? LIMIT 1", [userId]);
    return rows[0]?.mfa_enabled === 1;
  }

  /**
   * Verifies MFA token during login.
   * @param {number} userId - User ID
   * @param {string} token - TOTP token
   * @returns {Promise<boolean>} True if valid
   */
  async verifyMfaForLogin(userId, token) {
    const [rows] = await db.execute("SELECT mfa_secret, mfa_enabled FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!rows[0] || rows[0].mfa_enabled !== 1) return true;

    const secret = rows[0].mfa_secret;
    return this.mfa.verifyToken(secret, token);
  }

  /**
   * Fetches user role for JWT creation.
   * @param {number} userId - User ID
   * @returns {Promise<object|null>} User object with id and role
   */
  async getUserRole(userId) {
    const [rows] = await db.execute("SELECT id, role FROM users WHERE id = ? LIMIT 1", [userId]);
    return rows[0] || null;
  }
}

module.exports = { AuthService };