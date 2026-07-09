/**
 * Authentication routes for registration, login, MFA, email verification,
 * profile management, and support tickets.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { Router } = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/authMiddleware");
const emailService = require("../services/emailService");
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
  changePassword,
  createSupportTicket,
  getUserTickets,
  replyToTicket,
  allowTriggeredEmail,
  deleteAccount
} = require("../controllers/authController");

const authRoutes = Router();

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

authRoutes.post("/register",            asyncHandler(register));
authRoutes.post("/login",               asyncHandler(login));
authRoutes.get("/captcha",              asyncHandler(getCaptcha));
authRoutes.get("/verify-email",         asyncHandler(verifyEmail));
authRoutes.post("/resend-verification", asyncHandler(resendVerification));
authRoutes.post("/mfa/login-verify",    asyncHandler(verifyMfaLogin));

// POST /auth/forgot-password - Request password reset
authRoutes.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const [rows] = await db.execute(
      "SELECT id, first_name, email FROM users WHERE email = ? LIMIT 1",
      [email]
    );

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
    } catch (err) { console.log('Audit log skipped:', err.message); }

    // The per-address rate limit stops this endpoint from being used to spam a real inbox.
    if (allowTriggeredEmail(user.email)) {
      try {
        await emailService.sendPasswordResetEmail(user.email, user.first_name, resetToken);
      } catch (err) {
        console.error('Failed to send password reset email:', err.message);
      }
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

// POST /auth/reset-password - Reset password using valid token
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
    } catch (err) { console.log('Audit log skipped:', err.message); }

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

authRoutes.post("/mfa/begin",         requireAuth, asyncHandler(beginMfaSetup));
authRoutes.post("/mfa/confirm",       requireAuth, asyncHandler(confirmMfaSetup));
authRoutes.delete("/mfa",             requireAuth, asyncHandler(disableMfa));
authRoutes.get("/profile",            requireAuth, asyncHandler(getProfile));
authRoutes.put("/profile",            requireAuth, asyncHandler(updateProfile));
authRoutes.put("/change-email",       requireAuth, asyncHandler(changeEmail));
authRoutes.put("/change-password",    requireAuth, asyncHandler(changePassword));

// Support ticket routes
authRoutes.post("/support",           requireAuth, asyncHandler(createSupportTicket));
authRoutes.get("/support",            requireAuth, asyncHandler(getUserTickets));
authRoutes.put("/support/:id",        requireAuth, asyncHandler(replyToTicket));

// DELETE /auth/account — permanently delete the authenticated user's own account
authRoutes.delete("/account",          requireAuth, asyncHandler(deleteAccount));

module.exports = { authRoutes };