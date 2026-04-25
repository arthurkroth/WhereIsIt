/**
 * Authentication routes for registration, login, MFA, email verification, and profile management.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { Router } = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  register,
  login,
  getCaptcha,
  verifyEmail,
  resendVerification,
  beginMfaSetup,
  confirmMfaSetup,
  verifyMfaLogin,
  disableMfa,
  getProfile,
  updateProfile,
  changeEmail,
  changePassword
} = require("../controllers/authController");

const authRoutes = Router();

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

// POST /auth/register — Register new user account
authRoutes.post("/register", asyncHandler(register));

// POST /auth/login — Login with email and password
authRoutes.post("/login", asyncHandler(login));

// GET /auth/captcha — Generate a math captcha challenge
authRoutes.get("/captcha", asyncHandler(getCaptcha));

// GET /auth/verify-email?token=... — Verify email address from link
authRoutes.get("/verify-email", asyncHandler(verifyEmail));

// POST /auth/resend-verification — Resend verification email
authRoutes.post("/resend-verification", asyncHandler(resendVerification));

// POST /auth/mfa/login-verify — Verify MFA token or recovery code during login
authRoutes.post("/mfa/login-verify", asyncHandler(verifyMfaLogin));

// POST /auth/forgot-password — Request password reset
authRoutes.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const [rows] = await db.execute(
      "SELECT id, first_name, email FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    // Always return success to prevent email enumeration
    if (rows.length === 0) {
      return res.json({
        success: true,
        message: "If an account with that email exists, a password reset link will be sent."
      });
    }

    const user = rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.execute(
      "UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?",
      [hashedToken, expiresAt, user.id]
    );

    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [user.id, "FORGOT_PASSWORD_REQUESTED", "Password reset requested"]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    // Development mode — log the token to console and return in response
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      // Also send via email so the Ethereal preview URL is logged
      try {
        const emailService = require("../services/emailService");
        await emailService.sendPasswordResetEmail(user.email, user.first_name, resetToken);
      } catch (err) {
        console.error('Failed to send password reset email:', err.message);
      }

      console.log('Password reset token for', email, ':', resetToken);
      return res.json({
        success: true,
        message: "Password reset token generated (development mode)",
        resetToken,
        resetUrl: `http://localhost:3000/reset-password?token=${resetToken}`
      });
    }

    return res.json({
      success: true,
      message: "If an account with that email exists, a password reset link will be sent."
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: "An error occurred processing your request" });
  }
});

// POST /auth/reset-password — Reset password using valid token
authRoutes.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token) return res.status(400).json({ error: "Reset token is required" });
    if (!newPassword) return res.status(400).json({ error: "New password is required" });
    if (newPassword.length < 12) {
      return res.status(400).json({ error: "New password must be at least 12 characters" });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await db.execute(
      `SELECT id FROM users
       WHERE password_reset_token = ? AND password_reset_expires > NOW() LIMIT 1`,
      [hashedToken]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        error: "Invalid or expired reset token. Please request a new password reset."
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await db.execute(
      `UPDATE users SET password_hash = ?, password_reset_token = NULL,
       password_reset_expires = NULL WHERE id = ?`,
      [newPasswordHash, rows[0].id]
    );

    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [rows[0].id, "PASSWORD_RESET_SUCCESS", "Password reset successfully"]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({
      success: true,
      message: "Password reset successful. You can now login with your new password."
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: "An error occurred processing your request" });
  }
});

// ============================================================================
// PROTECTED ROUTES
// ============================================================================

// POST /auth/mfa/begin — Start MFA setup
authRoutes.post("/mfa/begin", requireAuth, asyncHandler(beginMfaSetup));

// POST /auth/mfa/confirm — Confirm MFA setup, returns recovery codes
authRoutes.post("/mfa/confirm", requireAuth, asyncHandler(confirmMfaSetup));

// DELETE /auth/mfa — Disable MFA and delete all recovery codes
authRoutes.delete("/mfa", requireAuth, asyncHandler(disableMfa));

// GET /auth/profile — Get current user's profile
authRoutes.get("/profile", requireAuth, asyncHandler(getProfile));

// PUT /auth/profile — Update name fields
authRoutes.put("/profile", requireAuth, asyncHandler(updateProfile));

// PUT /auth/change-email — Change email (requires password + triggers re-verification)
authRoutes.put("/change-email", requireAuth, asyncHandler(changeEmail));

// PUT /auth/change-password — Change password (requires current password)
authRoutes.put("/change-password", requireAuth, asyncHandler(changePassword));

module.exports = { authRoutes };