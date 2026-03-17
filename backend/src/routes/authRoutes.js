/**
 * Authentication routes for user registration, login, and MFA management.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
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
  beginMfaSetup,
  confirmMfaSetup,
  verifyMfaLogin,
  forgotPassword,
  resetPassword
} = require("../controllers/authController");

const authRoutes = Router();

/**
 * Public routes - no authentication required
 */

// POST /auth/register - Register new user account
authRoutes.post("/register", asyncHandler(register));

// POST /auth/login - Login with email and password
authRoutes.post("/login", asyncHandler(login));

// POST /auth/mfa/login-verify - Verify MFA token during login
authRoutes.post("/mfa/login-verify", asyncHandler(verifyMfaLogin));


/**
 * Protected routes - require authentication
 */

// POST /auth/mfa/begin - Begin MFA setup (requires JWT)
authRoutes.post("/mfa/begin", requireAuth, asyncHandler(beginMfaSetup));

// POST /auth/mfa/confirm - Confirm MFA setup (requires JWT)
authRoutes.post("/mfa/confirm", requireAuth, asyncHandler(confirmMfaSetup));


// POST /auth/forgot-password - Request password reset
authRoutes.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    // Check if user exists (but don't reveal this to client)
    const [rows] = await db.execute(
      "SELECT id, email FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    
    if (rows.length === 0) {
      // User doesn't exist - return success anyway to prevent enumeration
      console.log('Password reset attempted for non-existent email:', email);
      return res.json({ 
        success: true, 
        message: "If an account with that email exists, a password reset link will be sent." 
      });
    }
    
    const user = rows[0];
    
    // Generate secure random token
    const crypto = require("crypto");
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token before storing (like passwords, we don't store plain tokens)
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Set expiry to 1 hour from now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    // Store hashed token and expiry
    await db.execute(
      "UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?",
      [hashedToken, expiresAt, user.id]
    );
    
    // Log the event (optional - skip if audit_logs table doesn't exist)
    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [user.id, "FORGOT_PASSWORD_REQUESTED", "Password reset requested"]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }
    
    // Development mode: return token for testing
    // In production, you would send an email instead
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    if (isDevelopment) {
      console.log('Password reset token for', email, ':', resetToken);
      return res.json({
        success: true,
        message: "Password reset token generated (development mode)",
        resetToken: resetToken, // Only in development!
        resetUrl: `http://localhost:3000/reset-password?token=${resetToken}`
      });
    } else {
      // Production: send email with token
      // await emailService.sendPasswordReset(user.email, resetToken);
      return res.json({
        success: true,
        message: "If an account with that email exists, a password reset link will be sent."
      });
    }
    
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ 
      error: "An error occurred processing your request" 
    });
  }
});

// POST /auth/reset-password - Reset password using valid token
authRoutes.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    // Validate inputs
    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }
    
    if (!newPassword) {
      return res.status(400).json({ error: "New password is required" });
    }
    
    if (newPassword.length < 10) {
      return res.status(400).json({ 
        error: "New password must be at least 10 characters long" 
      });
    }
    
    // Hash the provided token to compare with stored hash
    const crypto = require("crypto");
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user with this token that hasn't expired
    const [rows] = await db.execute(
      `SELECT id, email FROM users 
       WHERE password_reset_token = ? 
       AND password_reset_expires > NOW()
       LIMIT 1`,
      [hashedToken]
    );
    
    if (rows.length === 0) {
      console.log('Invalid or expired token attempt');
      return res.status(400).json({ 
        error: "Invalid or expired reset token. Please request a new password reset." 
      });
    }
    
    const user = rows[0];
    
    // Hash the new password
    const bcrypt = require("bcryptjs");
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password and clear reset token
    await db.execute(
      `UPDATE users 
       SET password_hash = ?, 
           password_reset_token = NULL, 
           password_reset_expires = NULL 
       WHERE id = ?`,
      [newPasswordHash, user.id]
    );
    
    // Log the event (optional - skip if audit_logs table doesn't exist)
    try {
      await db.execute(
        "INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)",
        [user.id, "PASSWORD_RESET_SUCCESS", "Password reset successfully"]
      );
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }
    
    console.log('Password reset successful for user:', user.email);
    
    return res.json({
      success: true,
      message: "Password reset successful. You can now login with your new password."
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ 
      error: "An error occurred processing your request" 
    });
  }
});


module.exports = { authRoutes };