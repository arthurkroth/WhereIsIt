/**
 * MFA Service for TOTP generation and verification.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { authenticator } = require("otplib");

/**
 * TOTP MFA service (works with Google Authenticator).
 */
class MfaService {
  generateSecret() {
    return authenticator.generateSecret();
  }

  /**
   * Builds an otp-auth URL that front-end can convert to a QR code.
   * @param {string} email
   * @param {string} secret
   */
  getOtpauthUrl(email, secret) {
    return authenticator.keyuri(email, "WhereIsIt", secret);
  }

  /**
   * Verifies a TOTP token.
   * @param {string} secret
   * @param {string} token
   */
  verifyToken(secret, token) {
    return authenticator.check(token, secret);
  }
}

module.exports = { MfaService };