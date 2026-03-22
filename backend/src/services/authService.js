/**
 * Authentication Service for user management and MFA.
 * Author: Arthur Kroth - x22166971
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
   * Registers a new user with a hashed password.
   * Role is always set to FREE - PREMIUM requires payment (future feature).
   *
   * @param {string} email - User email
   * @param {string} password - Plain text password (will be hashed)
   * @param {string} role - User role (always FREE on registration)
   * @param {string} firstName - User first name
   * @param {string} lastName - User last name
   * @returns {Promise<number>} New user ID
   */
  async register(email, password, role, firstName, lastName) {
    const saltRounds = 12;
    const hash = await bcrypt.hash(password, saltRounds);

    const [result] = await db.execute(
      `INSERT INTO users 
       (email, first_name, last_name, password_hash, role, mfa_enabled, mfa_secret) 
       VALUES (?, ?, ?, ?, ?, 0, NULL)`,
      [email, firstName, lastName, hash, role]
    );
    return Number(result.insertId);
  }

  /**
   * Validates user credentials and returns the user row if correct.
   *
   * @param {string} email - User email
   * @param {string} password - Plain text password to check
   * @returns {Promise<object|null>} Full user object or null if invalid
   */
  async validatePassword(email, password) {
    const [rows] = await db.execute(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    const user = rows[0];
    if (!user) return null;

    const ok = await bcrypt.compare(password, user.password_hash);
    return ok ? user : null;
  }

  /**
   * Issues a signed JWT containing user identity and name.
   * The name is included so the frontend can display it without a separate API call.
   *
   * @param {{id: number, role: string, firstName: string, lastName: string}} user
   * @returns {string} Signed JWT token
   */
  issueJwt(user) {
    return jwt.sign(
      {
        userId: user.id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn }
    );
  }

  /**
   * Starts MFA setup by generating and storing a TOTP secret.
   *
   * @param {number} userId - User ID
   * @returns {Promise<object>} Setup info with secret and otpauthUrl
   */
  async beginMfaSetup(userId) {
    const [rows] = await db.execute(
      "SELECT email FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const email = rows[0]?.email;
    if (!email) throw new Error("User not found");

    const secret = this.mfa.generateSecret();
    const otpauthUrl = this.mfa.getOtpauthUrl(email, secret);

    await db.execute(
      "UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?",
      [secret, userId]
    );
    return { secret, otpauthUrl };
  }

  /**
   * Confirms MFA setup by verifying the first TOTP token and enabling MFA.
   *
   * @param {number} userId - User ID
   * @param {string} token - TOTP token from authenticator app
   * @returns {Promise<boolean>} True if token is valid
   */
  async confirmMfa(userId, token) {
    const [rows] = await db.execute(
      "SELECT mfa_secret FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const secret = rows[0]?.mfa_secret;
    if (!secret) return false;

    const ok = this.mfa.verifyToken(secret, token);
    if (ok) {
      await db.execute(
        "UPDATE users SET mfa_enabled = 1 WHERE id = ?",
        [userId]
      );
    }
    return ok;
  }

  /**
   * Checks if MFA is enabled for a given user.
   *
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} True if MFA is enabled
   */
  async requiresMfa(userId) {
    const [rows] = await db.execute(
      "SELECT mfa_enabled FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    return rows[0]?.mfa_enabled === 1;
  }

  /**
   * Verifies a TOTP token during login.
   *
   * @param {number} userId - User ID
   * @param {string} token - TOTP token from authenticator app
   * @returns {Promise<boolean>} True if token is valid
   */
  async verifyMfaForLogin(userId, token) {
    const [rows] = await db.execute(
      "SELECT mfa_secret, mfa_enabled FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!rows[0] || rows[0].mfa_enabled !== 1) return true;

    const secret = rows[0].mfa_secret;
    return this.mfa.verifyToken(secret, token);
  }

  /**
   * Fetches user details needed for JWT issuance after MFA login.
   * Returns id, role, and name fields.
   *
   * @param {number} userId - User ID
   * @returns {Promise<object|null>} User object or null if not found
   */
  async getUserRole(userId) {
    const [rows] = await db.execute(
      "SELECT id, role, first_name, last_name FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    return rows[0] || null;
  }
}

module.exports = { AuthService };