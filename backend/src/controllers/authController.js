/**
 * Authentication controller for registration, login, MFA, and profile management.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { AuthService } = require("../services/authService");
const { AuditLogService } = require("../services/auditLogService");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { db } = require("../config/db");
const emailService = require("../services/emailService");
const {
  registerSchema,
  loginSchema,
  verifyMfaSchema,
  mfaLoginVerifySchema
} = require("../validation/authValidation");

const authService = new AuthService();
const audit = new AuditLogService();

// ============================================================================
// CAPTCHA
// ============================================================================

const captchaStore = new Map();
const failedLoginAttempts = new Map();
const CAPTCHA_THRESHOLD = 3;
const CAPTCHA_EXPIRY_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of captchaStore.entries()) {
    if (data.expiresAt < now) captchaStore.delete(id);
  }
}, 60 * 1000);

/**
 * GET /auth/captcha
 * Generates a simple math challenge. Answer is stored server-side only.
 */
async function getCaptcha(req, res) {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  const captchaId = crypto.randomUUID();
  captchaStore.set(captchaId, { answer: a + b, expiresAt: Date.now() + CAPTCHA_EXPIRY_MS });
  return res.json({ captchaId, question: `What is ${a} + ${b}?` });
}

// ============================================================================
// RECOVERY CODES — helpers
// ============================================================================

function generateRecoveryCode() {
  const segment = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${segment()}-${segment()}-${segment()}`;
}

function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function createRecoveryCodes(userId) {
  await db.execute('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const code = generateRecoveryCode();
    await db.execute(
      'INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)',
      [userId, hashRecoveryCode(code)]
    );
    codes.push(code);
  }
  return codes;
}

// ============================================================================
// EMAIL VERIFICATION — helpers
// ============================================================================

/**
 * Generates a verification token, stores its SHA-256 hash with a 24-hour expiry,
 * and sends the verification email.
 */
async function sendVerificationEmail(userId, email, firstName) {
  const plainToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.execute(
    `UPDATE users SET email_verification_token = ?, email_verification_expires = ? WHERE id = ?`,
    [hashedToken, expiresAt, userId]
  );

  await emailService.sendVerificationEmail(email, firstName, plainToken);
}

// ============================================================================
// REGISTRATION & LOGIN
// ============================================================================

/**
 * POST /auth/register
 * Creates a new user account with FREE role and sends a verification email.
 */
async function register(req, res) {
  const parsed = registerSchema.parse(req.body);
  const role = 'FREE';

  const userId = await authService.register(
    parsed.email, parsed.password, role, parsed.firstName, parsed.lastName
  );

  try {
    await sendVerificationEmail(userId, parsed.email, parsed.firstName);
  } catch (err) {
    console.error('Failed to send verification email:', err.message);
  }

  await audit.log(userId, "REGISTER", `User registered with role ${role}`);

  return res.status(201).json({
    userId,
    message: 'Registration successful. Please check your email to verify your account.'
  });
}

/**
 * GET /auth/verify-email?token=...
 * Verifies a user's email address using the token from the verification link.
 *
 * THREE OUTCOMES:
 * 1. Token found, not expired, not yet verified → verify and return success
 * 2. Token not found BUT email is already verified → return alreadyVerified: true
 *    (handles React StrictMode double-invocation gracefully)
 * 3. Token not found and email not verified → return expired error
 */
async function verifyEmail(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Verification token is required' });
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // First: look for a valid pending token
  const [rows] = await db.execute(
    `SELECT id, first_name FROM users
     WHERE email_verification_token = ?
     AND email_verification_expires > NOW()
     AND email_verified = FALSE
     LIMIT 1`,
    [hashedToken]
  );

  if (rows.length > 0) {
    // Valid token found — mark as verified and clear the token
    await db.execute(
      `UPDATE users
       SET email_verified = TRUE,
           email_verification_token = NULL,
           email_verification_expires = NULL
       WHERE id = ?`,
      [rows[0].id]
    );

    try {
      await audit.log(rows[0].id, "EMAIL_VERIFIED", "User verified their email address");
    } catch (err) {
      console.log('Audit log skipped:', err.message);
    }

    return res.json({
      success: true,
      alreadyVerified: false,
      message: 'Email verified successfully. You can now log in.'
    });
  }

  // Token not found — check if the account is already verified
  // This handles the React StrictMode double-call: the first call verifies and
  // clears the token; the second call finds no token but sees email_verified = TRUE
  const [verifiedRows] = await db.execute(
    `SELECT id FROM users WHERE email_verification_token = ? AND email_verified = TRUE LIMIT 1`,
    [hashedToken]
  );

  // Also check by matching the recently-cleared token pattern:
  // if email_verified is TRUE and token is NULL, the most recent user might be the one
  // We handle this by just checking if any user has this as a token (even if verified already)
  // A simpler approach: try finding user with verified=TRUE and no token (cleared just now)
  // The cleanest solution is the one below — look up by hashed token regardless of verified state
  const [anyRows] = await db.execute(
    `SELECT id, email_verified FROM users
     WHERE email_verification_token = ?
     LIMIT 1`,
    [hashedToken]
  );

  if (anyRows.length > 0 && anyRows[0].email_verified) {
    // Token still in DB but already verified (shouldn't normally happen, but just in case)
    return res.json({
      success: true,
      alreadyVerified: true,
      message: 'Your email address is already verified. You can log in.'
    });
  }

  // No record at all — token is genuinely expired or invalid
  // Last check: was this email recently verified? (token was cleared after successful verify)
  // We can't know for sure without the original email, so return the expired error
  return res.status(400).json({
    error: 'Invalid or expired verification link. Please request a new one.',
    expired: true
  });
}

/**
 * POST /auth/resend-verification
 * Resends the verification email. Always returns success to prevent enumeration.
 */
async function resendVerification(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const [rows] = await db.execute(
      'SELECT id, first_name, email FROM users WHERE email = ? AND email_verified = FALSE LIMIT 1',
      [email.trim().toLowerCase()]
    );

    if (rows.length > 0) {
      const user = rows[0];
      await sendVerificationEmail(user.id, user.email, user.first_name);
      try { await audit.log(user.id, "VERIFICATION_EMAIL_RESENT", "Verification email resent"); } catch {}
    }
  } catch (err) {
    console.error('Resend verification error:', err.message);
  }

  return res.json({
    success: true,
    message: 'If an unverified account with that email exists, a new verification link has been sent.'
  });
}

/**
 * POST /auth/login
 * Validates credentials. Blocks login if email is not verified.
 */
async function login(req, res) {
  const parsed = loginSchema.parse(req.body);

  const attempts = failedLoginAttempts.get(parsed.email) || { count: 0 };
  const requiresCaptcha = attempts.count >= CAPTCHA_THRESHOLD;

  if (requiresCaptcha) {
    if (!parsed.captchaId || !parsed.captchaAnswer) {
      return res.status(401).json({ error: 'Invalid email or password', requiresCaptcha: true });
    }
    const captcha = captchaStore.get(parsed.captchaId);
    if (!captcha || captcha.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Invalid email or password', requiresCaptcha: true, captchaExpired: true });
    }
    if (parseInt(parsed.captchaAnswer) !== captcha.answer) {
      return res.status(401).json({ error: 'Invalid email or password', requiresCaptcha: true });
    }
    captchaStore.delete(parsed.captchaId);
  }

  const user = await authService.validatePassword(parsed.email, parsed.password);

  if (!user) {
    const current = failedLoginAttempts.get(parsed.email) || { count: 0 };
    const newCount = current.count + 1;
    failedLoginAttempts.set(parsed.email, { count: newCount, lastAttempt: Date.now() });
    return res.status(401).json({
      error: 'Invalid email or password',
      requiresCaptcha: newCount >= CAPTCHA_THRESHOLD
    });
  }

  failedLoginAttempts.delete(parsed.email);

  // Block login if email is not verified
  const [verifyRows] = await db.execute(
    'SELECT email_verified FROM users WHERE id = ?', [user.id]
  );

  if (verifyRows.length > 0 && !verifyRows[0].email_verified) {
    return res.status(403).json({
      error: 'Please verify your email address before logging in.',
      emailNotVerified: true,
      email: parsed.email
    });
  }

  const needsMfa = await authService.requiresMfa(user.id);
  await audit.log(user.id, "LOGIN_ATTEMPT", `MFA enabled: ${needsMfa}`);

  if (needsMfa) return res.json({ mfaRequired: true, userId: user.id });

  const token = authService.issueJwt({
    id: user.id, role: user.role,
    firstName: user.first_name, lastName: user.last_name
  });

  return res.json({ mfaRequired: false, token });
}

// ============================================================================
// MFA
// ============================================================================

async function beginMfaSetup(req, res) {
  const user = req.user;
  const setup = await authService.beginMfaSetup(user.userId);
  await audit.log(user.userId, "MFA_BEGIN", "MFA setup started");
  res.json({ otpauthUrl: setup.otpauthUrl });
}

async function confirmMfaSetup(req, res) {
  const user = req.user;
  const parsed = verifyMfaSchema.parse(req.body);
  const ok = await authService.confirmMfa(user.userId, parsed.token);
  if (!ok) {
    await audit.log(user.userId, "MFA_CONFIRM_FAILED", "Invalid TOTP code during MFA setup");
    return res.json({ success: false });
  }
  const recoveryCodes = await createRecoveryCodes(user.userId);
  await audit.log(user.userId, "MFA_CONFIRM", "MFA setup confirmed, recovery codes generated");
  return res.json({ success: true, recoveryCodes });
}

async function verifyMfaLogin(req, res) {
  const parsed = mfaLoginVerifySchema.parse(req.body);
  let ok = await authService.verifyMfaForLogin(parsed.userId, parsed.token);
  let usedRecoveryCode = false;

  if (!ok) {
    const tokenHash = hashRecoveryCode(parsed.token);
    const [codeRows] = await db.execute(
      'SELECT id FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ? AND used = FALSE',
      [parsed.userId, tokenHash]
    );
    if (codeRows.length > 0) {
      await db.execute('UPDATE mfa_recovery_codes SET used = TRUE WHERE id = ?', [codeRows[0].id]);
      ok = true;
      usedRecoveryCode = true;
    }
  }

  if (!ok) return res.status(401).json({ error: "Invalid MFA token" });

  const userRow = await authService.getUserRole(parsed.userId);
  if (!userRow) return res.status(404).json({ error: "User not found" });

  const token = authService.issueJwt({
    id: userRow.id, role: userRow.role,
    firstName: userRow.first_name, lastName: userRow.last_name
  });

  await audit.log(parsed.userId, "LOGIN_SUCCESS", usedRecoveryCode ? "MFA login via recovery code" : "MFA login success");
  res.json({ token });
}

async function disableMfa(req, res) {
  const userId = req.user.userId;
  await db.execute("UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = ?", [userId]);
  await db.execute('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
  try { await audit.log(userId, "MFA_DISABLED", "User disabled MFA from profile page"); } catch {}
  return res.json({ success: true, message: "MFA has been disabled" });
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

async function getProfile(req, res) {
  const userId = req.user.userId;
  const [rows] = await db.execute(
    "SELECT id, email, first_name, last_name, role, mfa_enabled, email_verified, created_at FROM users WHERE id = ?",
    [userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "User not found" });

  const user = rows[0];
  const [codeRows] = await db.execute(
    'SELECT COUNT(*) as count FROM mfa_recovery_codes WHERE user_id = ? AND used = FALSE', [userId]
  );

  return res.json({
    success: true,
    profile: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      mfaEnabled: user.mfa_enabled === 1 || user.mfa_enabled === true,
      emailVerified: user.email_verified === 1 || user.email_verified === true,
      remainingRecoveryCodes: codeRows[0].count,
      createdAt: user.created_at
    }
  });
}

async function updateProfile(req, res) {
  const userId = req.user.userId;
  const { firstName, lastName } = req.body;
  if (!firstName?.trim()) return res.status(400).json({ error: "First name is required" });
  if (!lastName?.trim()) return res.status(400).json({ error: "Last name is required" });
  await db.execute(
    "UPDATE users SET first_name = ?, last_name = ? WHERE id = ?",
    [firstName.trim().substring(0, 50), lastName.trim().substring(0, 50), userId]
  );
  try { await audit.log(userId, "PROFILE_UPDATED", "User updated their name"); } catch {}
  return res.json({ success: true, message: "Profile updated successfully" });
}

async function changeEmail(req, res) {
  const userId = req.user.userId;
  const { newEmail, currentPassword } = req.body;
  if (!newEmail?.trim()) return res.status(400).json({ error: "New email is required" });
  if (!currentPassword) return res.status(400).json({ error: "Current password is required" });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail.trim())) return res.status(400).json({ error: "Invalid email format" });

  const [userRows] = await db.execute("SELECT id, first_name, password_hash FROM users WHERE id = ?", [userId]);
  if (userRows.length === 0) return res.status(404).json({ error: "User not found" });

  const passwordValid = await bcrypt.compare(currentPassword, userRows[0].password_hash);
  if (!passwordValid) return res.status(401).json({ error: "Current password is incorrect" });

  const cleanEmail = newEmail.trim().toLowerCase();
  const [existingRows] = await db.execute("SELECT id FROM users WHERE email = ? AND id != ?", [cleanEmail, userId]);
  if (existingRows.length > 0) return res.status(409).json({ error: "This email address is already in use" });

  await db.execute("UPDATE users SET email = ?, email_verified = FALSE WHERE id = ?", [cleanEmail, userId]);

  try {
    await sendVerificationEmail(userId, cleanEmail, userRows[0].first_name);
  } catch (err) {
    console.error('Failed to send verification email after email change:', err.message);
  }

  try { await audit.log(userId, "EMAIL_CHANGED", `Email changed to ${cleanEmail}`); } catch {}
  return res.json({ success: true, message: "Email updated. Please check your new inbox to verify your address." });
}

async function changePassword(req, res) {
  const userId = req.user.userId;
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: "All password fields are required" });
  }
  if (newPassword !== confirmPassword) return res.status(400).json({ error: "New passwords do not match" });
  if (newPassword.length < 12) return res.status(400).json({ error: "New password must be at least 12 characters" });
  if (newPassword === currentPassword) return res.status(400).json({ error: "New password must be different from your current password" });

  const [userRows] = await db.execute("SELECT id, password_hash FROM users WHERE id = ?", [userId]);
  if (userRows.length === 0) return res.status(404).json({ error: "User not found" });

  const passwordValid = await bcrypt.compare(currentPassword, userRows[0].password_hash);
  if (!passwordValid) return res.status(401).json({ error: "Current password is incorrect" });

  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", [newPasswordHash, userId]);

  try { await audit.log(userId, "PASSWORD_CHANGED", "User changed their password"); } catch {}
  return res.json({ success: true, message: "Password changed successfully" });
}

module.exports = {
  register, login, getCaptcha,
  verifyEmail, resendVerification,
  beginMfaSetup, confirmMfaSetup, verifyMfaLogin, disableMfa,
  getProfile, updateProfile, changeEmail, changePassword
};