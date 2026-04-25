/**
 * File: emailService.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const nodemailer = require('nodemailer');

/**
 * EmailService
 * Handles all outgoing emails for the WhereIsIt application.
 *
 * DEVELOPMENT MODE (current):
 * Uses Ethereal Email — a free fake SMTP service that captures emails
 * without actually delivering them. When an email is "sent", Nodemailer
 * prints a preview URL to the backend console. Opening that URL shows
 * the full email in a browser.
 *
 * No account or signup is needed. Ethereal generates a fresh temporary
 * inbox automatically each time the backend starts.
 *
 * PRODUCTION MODE (future):
 * Replace createEtherealTransport() with a real SMTP provider such as
 * SendGrid, Mailgun, or AWS SES. The send methods below do not need
 * to change — only the transport configuration does.
 *
 * SECURITY NOTES:
 * - Verification tokens are generated with crypto.randomBytes(32) — 256 bits
 * - Tokens are SHA-256 hashed before database storage
 * - Links expire after 24 hours
 * - Emails never contain the plain token in the subject line
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.fromAddress = '"WhereIsIt?" <noreply@whereis.it>';
    this.appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  }

  /**
   * Lazily initialises the Nodemailer transport using an Ethereal test account.
   * Called automatically before the first email is sent.
   * The generated Ethereal credentials are logged to the console once.
   */
  async getTransporter() {
    if (this.transporter) return this.transporter;

    // Create a one-time Ethereal test account
    const testAccount = await nodemailer.createTestAccount();

    console.log('─────────────────────────────────────────────────────');
    console.log('📧  Ethereal Email transport initialised');
    console.log(`    User: ${testAccount.user}`);
    console.log(`    Pass: ${testAccount.pass}`);
    console.log('    Preview emails at: https://ethereal.email/messages');
    console.log('─────────────────────────────────────────────────────');

    this.transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });

    return this.transporter;
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
    const transporter = await this.getTransporter();

    const verifyUrl = `${this.appBaseUrl}/verify-email?token=${token}`;

    const mailOptions = {
      from: this.fromAddress,
      to: toEmail,
      subject: 'Verify your WhereIsIt? account',
      html: `
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
            WhereIsIt? — Keep track of your receipts and warranties
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);

    // In development, log the Ethereal preview URL to the console
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('─────────────────────────────────────────────────────');
      console.log(`📧  Verification email sent to: ${toEmail}`);
      console.log(`    Preview URL: ${previewUrl}`);
      console.log('─────────────────────────────────────────────────────');
    }
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
    const transporter = await this.getTransporter();

    const resetUrl = `${this.appBaseUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: this.fromAddress,
      to: toEmail,
      subject: 'Reset your WhereIsIt? password',
      html: `
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
            WhereIsIt? — Keep track of your receipts and warranties
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('─────────────────────────────────────────────────────');
      console.log(`📧  Password reset email sent to: ${toEmail}`);
      console.log(`    Preview URL: ${previewUrl}`);
      console.log('─────────────────────────────────────────────────────');
    }
  }
}

// Export a single shared instance so the transport is only initialised once
module.exports = new EmailService();