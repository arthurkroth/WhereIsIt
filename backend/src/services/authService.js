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

class AuthService {
  constructor() {
    this.mfa = new MfaService();
  }

  /**
   * Registering the user with a hashed password.
   * @param {string} email
   * @param {string} password
   * @param {"FREE"|"PREMIUM"} role
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
   * Validating credentials and returning user row if correct.
   * @param {string} email
   * @param {string} password
   */
  async validatePassword(email, password) {
    const [rows] = await db.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
    const user = rows[0];
    if (!user) return null;

    const ok = await bcrypt.compare(password, user.password_hash);
    return ok ? user : null;
  }

  /**
   * Issuing a JWT for API authentication.
   * @param {{id:number, role:"FREE"|"PREMIUM"|"ADMIN"}} user
   */
  issueJwt(user) {
    return jwt.sign({ userId: user.id, role: user.role }, env.jwt.secret, {
      expiresIn: env.jwt.expiresIn
    });
  }

  /**
   * Starts MFA setup by generating and storing a secret (MFA not enabled until confirmed).
   * @param {number} userId
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
   * @param {number} userId
   * @param {string} token
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
   * Checks if MFA is enabled.
   * @param {number} userId
   */
  async requiresMfa(userId) {
    const [rows] = await db.execute("SELECT mfa_enabled FROM users WHERE id = ? LIMIT 1", [userId]);
    return rows[0]?.mfa_enabled === 1;
  }

  /**
   * Verifies MFA token during login when enabled.
   * @param {number} userId
   * @param {string} token
   */
  async verifyMfaForLogin(userId, token) {
    const [rows] = await db.execute("SELECT mfa_secret, mfa_enabled FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!rows[0] || rows[0].mfa_enabled !== 1) return true;

    const secret = rows[0].mfa_secret;
    return this.mfa.verifyToken(secret, token);
  }

  /**
   * Fetches role for JWT creation.
   * @param {number} userId
   */
  async getUserRole(userId) {
    const [rows] = await db.execute("SELECT id, role FROM users WHERE id = ? LIMIT 1", [userId]);
    return rows[0] || null;
  }
}

module.exports = { AuthService };