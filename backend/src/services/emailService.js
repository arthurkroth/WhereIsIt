/**
 * File: emailService.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { Resend } = require('resend');
const { env } = require('../config/env');

/**
 * EmailService
 * Handles all outgoing emails for the WhereIsIt application via Resend
 * (https://resend.com). The API key and verified "from" address come from
 * environment variables - never hardcoded - so nothing sensitive lives in
 * source control.
 *
 * SECURITY NOTES:
 * - Verification tokens are generated with crypto.randomBytes(32) - 256 bits
 * - Tokens are SHA-256 hashed before database storage
 * - Links expire after 24 hours
 * - Emails never contain the plain token in the subject line
 * - The Resend API is called over HTTPS - no raw SMTP credentials in play
 */
class EmailService {
  constructor() {
    this.fromAddress = env.email.fromAddress;
    this.appBaseUrl = env.appBaseUrl;
    this.resendClient = new Resend(env.email.resendApiKey);
  }

  /**
   * Sends an email via Resend. This is the single chokepoint every other
   * method (and every other file that sends email) goes through.
   *
   * @param {{to: string, subject: string, html: string}} message
   * @returns {Promise<void>}
   */
  async sendEmail({ to, subject, html }) {
    await this.resendClient.emails.send({ from: this.fromAddress, to, subject, html });
  }

  /**
   * Sends a verification email to a newly registered user.
   * The email contains a time-limited link the user must click to verify
   * their email address before they can log in.
   *
   * @param {string} toEmail - Recipient email address
   * @param {string} firstName - User's first name for personalisation
   * @param {string} token - Plain-text verification token (not hashed)
   * @returns {Promise<void>}
   */
  async sendVerificationEmail(toEmail, firstName, token) {
    const verifyUrl = `${this.appBaseUrl}/verify-email?token=${token}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0d6efd;">Welcome to WhereIsIt?, ${firstName}!</h2>
        <p>Thank you for registering. Please verify your email address by clicking the button below.</p>
        <p>This link expires in <strong>24 hours</strong>.</p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${verifyUrl}"
             style="background-color: #0d6efd; color: white; padding: 14px 28px;
                    text-decoration: none; border-radius: 6px; font-size: 16px;">
            Verify Email Address
          </a>
        </div>

        <p style="color: #666; font-size: 14px;">
          If the button does not work, copy and paste this link into your browser:
          <br>
          <a href="${verifyUrl}">${verifyUrl}</a>
        </p>

        <p style="color: #666; font-size: 14px;">
          If you did not create a WhereIsIt? account, you can safely ignore this email.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #aaa; font-size: 12px; text-align: center;">
          WhereIsIt? - Keep track of your receipts and warranties
        </p>
      </div>
    `;

    await this.sendEmail({ to: toEmail, subject: 'Verify your WhereIsIt? account', html });
  }

  /**
   * Sends a password reset email.
   * The email contains a time-limited link the user must click to reset
   * their password.
   *
   * @param {string} toEmail - Recipient email address
   * @param {string} firstName - User's first name for personalisation
   * @param {string} token - Plain-text reset token (not hashed)
   * @returns {Promise<void>}
   */
  async sendPasswordResetEmail(toEmail, firstName, token) {
    const resetUrl = `${this.appBaseUrl}/reset-password?token=${token}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0d6efd;">Password Reset Request</h2>
        <p>Hi ${firstName}, we received a request to reset your WhereIsIt? password.</p>
        <p>Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}"
             style="background-color: #dc3545; color: white; padding: 14px 28px;
                    text-decoration: none; border-radius: 6px; font-size: 16px;">
            Reset Password
          </a>
        </div>

        <p style="color: #666; font-size: 14px;">
          If the button does not work, copy and paste this link into your browser:
          <br>
          <a href="${resetUrl}">${resetUrl}</a>
        </p>

        <p style="color: #666; font-size: 14px;">
          If you did not request a password reset, you can safely ignore this email.
          Your password will not change.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #aaa; font-size: 12px; text-align: center;">
          WhereIsIt? - Keep track of your receipts and warranties
        </p>
      </div>
    `;

    await this.sendEmail({ to: toEmail, subject: 'Reset your WhereIsIt? password', html });
  }

  /**
   * Sends a security alert to an administrator when another account is
   * locked out after repeated failed login attempts.
   *
   * @param {string} toEmail - Administrator's email address
   * @param {string} lockedEmail - Email address of the account that was locked
   * @returns {Promise<void>}
   */
  async sendAdminLockoutAlert(toEmail, lockedEmail) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Account Locked</h2>
        <p>The account <strong>${lockedEmail}</strong> has been temporarily locked
        after exceeding the maximum number of failed login attempts.</p>
        <p>This may indicate a brute-force attempt against an administrator account.
        Review the audit logs for this user if this was unexpected.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #aaa; font-size: 12px; text-align: center;">
          WhereIsIt? - Keep track of your receipts and warranties
        </p>
      </div>
    `;

    await this.sendEmail({
      to: toEmail,
      subject: 'Security Alert: Account locked after repeated failed logins',
      html
    });
  }
}

// Export a single shared instance so the Resend client is only created once
module.exports = new EmailService();
