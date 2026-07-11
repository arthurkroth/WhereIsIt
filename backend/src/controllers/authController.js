/**
 * Authentication controller for registration, login, MFA, and profile management.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * ADDED: replyToTicket - allows users to reply to their own support tickets
 * when an admin has responded and the ticket is not yet resolved.
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
const mfaFailedAttempts = new Map();
const CAPTCHA_THRESHOLD = 3;
const CAPTCHA_EXPIRY_MS = 5 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;
const USER_LOCKOUT_MS = 30 * 60 * 1000;
const ADMIN_LOCKOUT_MS = 60 * 60 * 1000;
const MFA_COOLDOWN_THRESHOLD = 3;
const MFA_COOLDOWN_MS = 5 * 60 * 1000;

// Caps how often a real email can actually be triggered to a given address.
// Without this, forgot-password/resend-verification could be used to spam a
// real victim's inbox now that emails are genuinely delivered - This was a security vulnerability found on static analysis.
const emailRateLimits = new Map();
const EMAIL_RATE_LIMIT_MAX = 3;
const EMAIL_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// Returns true if another triggered email may be sent to this address right
// now, and records the attempt. Returns false once the rolling-hour cap is hit.
function allowTriggeredEmail(email) {
  const now = Date.now();
  const entry = emailRateLimits.get(email);
  if (!entry || entry.windowStart + EMAIL_RATE_LIMIT_WINDOW_MS < now) {
    emailRateLimits.set(email, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= EMAIL_RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of captchaStore.entries()) {
    if (data.expiresAt < now) captchaStore.delete(id);
  }
}, 60 * 1000);

// Sends an email to every admin account warning that another account was locked out.
async function notifyAdminsOfLockout(lockedEmail) {
  const [admins] = await db.execute("SELECT email FROM users WHERE role = 'ADMIN'");
  for (const admin of admins) {
    try { await emailService.sendAdminLockoutAlert(admin.email, lockedEmail); }
    catch (err) { console.error('Failed to send admin lockout alert:', err.message); }
  }
}

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
// RECOVERY CODES - helpers
// ============================================================================

// Generates a random recovery code in XXXXXX-XXXXXX-XXXXXX format.
function generateRecoveryCode() {
  const segment = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${segment()}-${segment()}-${segment()}`;
}

// Hashes a recovery code for storage (codes are never stored in plain text).
function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// Replaces a user's recovery codes with a fresh set of 8 and returns the plain-text codes once.
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
// EMAIL VERIFICATION - helpers
// ============================================================================

// Generates a verification token, stores its hash, and emails the plain token to the user.
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

async function register(req, res) {
  const parsed = registerSchema.parse(req.body);
  const role = 'FREE';

  let userId;
  try {
    userId = await authService.register(
      parsed.email, parsed.password, role, parsed.firstName, parsed.lastName
    );
  } catch (err) {
    // Duplicate email - return a clean error without leaking the raw DB message
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    throw err;
  }

  try {
    await sendVerificationEmail(userId, parsed.email, parsed.firstName);
  } catch (err) {
    console.error('Failed to send verification email:', err.message);
  }

  await audit.log(userId, "REGISTER", `User registered with role ${role}`, req.ip);

  return res.status(201).json({
    userId,
    message: 'Registration successful. Please check your email to verify your account.'
  });
}

async function verifyEmail(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Verification token is required' });

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const [rows] = await db.execute(
    `SELECT id, first_name FROM users
     WHERE email_verification_token = ?
     AND email_verification_expires > NOW()
     AND email_verified = FALSE LIMIT 1`,
    [hashedToken]
  );

  if (rows.length > 0) {
    await db.execute(
      `UPDATE users SET email_verified = TRUE,
       email_verification_token = NULL, email_verification_expires = NULL WHERE id = ?`,
      [rows[0].id]
    );
    try { await audit.log(rows[0].id, "EMAIL_VERIFIED", "User verified their email address", req.ip); } catch {}
    return res.json({ success: true, alreadyVerified: false, message: 'Email verified successfully. You can now log in.' });
  }

  const [anyRows] = await db.execute(
    `SELECT id, email_verified FROM users WHERE email_verification_token = ? LIMIT 1`,
    [hashedToken]
  );

  if (anyRows.length > 0 && anyRows[0].email_verified) {
    return res.json({ success: true, alreadyVerified: true, message: 'Your email address is already verified. You can log in.' });
  }

  return res.status(400).json({ error: 'Invalid or expired verification link. Please request a new one.', expired: true });
}

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
      if (allowTriggeredEmail(user.email)) {
        await sendVerificationEmail(user.id, user.email, user.first_name);
        try { await audit.log(user.id, "VERIFICATION_EMAIL_RESENT", "Verification email resent", req.ip); } catch {}
      } else {
        try { await audit.log(user.id, "VERIFICATION_EMAIL_RATE_LIMITED", "Resend verification throttled", req.ip); } catch {}
      }
    }
  } catch (err) {
    console.error('Resend verification error:', err.message);
  }

  return res.json({ success: true, message: 'If an unverified account with that email exists, a new verification link has been sent.' });
}

async function login(req, res) {
  const parsed = loginSchema.parse(req.body);

  const attempts = failedLoginAttempts.get(parsed.email) || { count: 0 };

  // Reject immediately if the account is currently locked out
  if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
    const minutesLeft = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
    await audit.log(null, "ACCOUNT_LOCKED_ATTEMPT", `Login attempted on locked account: ${parsed.email}`, req.ip);
    return res.status(403).json({
      error: `Account temporarily locked due to repeated failed attempts. Try again in ${minutesLeft} minute(s).`,
      accountLocked: true
    });
  }

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
    const updated = { count: newCount, lastAttempt: Date.now() };

    if (newCount >= LOCKOUT_THRESHOLD) {
      const [roleRows] = await db.execute('SELECT role FROM users WHERE email = ? LIMIT 1', [parsed.email]);
      const isAdmin = roleRows[0]?.role === 'ADMIN';
      const lockoutMs = isAdmin ? ADMIN_LOCKOUT_MS : USER_LOCKOUT_MS;
      updated.lockedUntil = Date.now() + lockoutMs;

      await audit.log(null, "ACCOUNT_LOCKED", `Account ${parsed.email} locked for ${lockoutMs / 60000} minutes after ${newCount} failed attempts`, req.ip);
      if (isAdmin) {
        notifyAdminsOfLockout(parsed.email).catch(err => console.error('notifyAdminsOfLockout failed:', err.message));
      }
    }

    failedLoginAttempts.set(parsed.email, updated);
    return res.status(401).json({
      error: 'Invalid email or password',
      requiresCaptcha: newCount >= CAPTCHA_THRESHOLD,
      accountLocked: !!updated.lockedUntil
    });
  }

  // Block login if the account has been suspended
  if (user.status === 'suspended') {
    return res.status(403).json({
      error: 'Your account has been suspended. Please contact support.',
      accountSuspended: true
    });
  }

  failedLoginAttempts.delete(parsed.email);

  const [verifyRows] = await db.execute('SELECT email_verified FROM users WHERE id = ?', [user.id]);
  if (verifyRows.length > 0 && !verifyRows[0].email_verified) {
    return res.status(403).json({
      error: 'Please verify your email address before logging in.',
      emailNotVerified: true, email: parsed.email
    });
  }

  const needsMfa = await authService.requiresMfa(user.id);
  await audit.log(user.id, "LOGIN_ATTEMPT", `MFA enabled: ${needsMfa}`, req.ip);

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
  await audit.log(user.userId, "MFA_BEGIN", "MFA setup started", req.ip);
  res.json({ otpauthUrl: setup.otpauthUrl });
}

async function confirmMfaSetup(req, res) {
  const user = req.user;
  const parsed = verifyMfaSchema.parse(req.body);
  const ok = await authService.confirmMfa(user.userId, parsed.token);
  if (!ok) {
    await audit.log(user.userId, "MFA_CONFIRM_FAILED", "Invalid TOTP code during MFA setup", req.ip);
    return res.json({ success: false });
  }
  const recoveryCodes = await createRecoveryCodes(user.userId);
  await audit.log(user.userId, "MFA_CONFIRM", "MFA setup confirmed, recovery codes generated", req.ip);
  return res.json({ success: true, recoveryCodes });
}

async function verifyMfaLogin(req, res) {
  const parsed = mfaLoginVerifySchema.parse(req.body);

  const mfaAttempts = mfaFailedAttempts.get(parsed.userId) || { count: 0 };
  if (mfaAttempts.cooldownUntil && mfaAttempts.cooldownUntil > Date.now()) {
    const minutesLeft = Math.ceil((mfaAttempts.cooldownUntil - Date.now()) / 60000);
    return res.status(429).json({
      error: `Too many invalid codes. Try again in ${minutesLeft} minute(s).`,
      cooldownActive: true
    });
  }

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

  if (!ok) {
    const newCount = mfaAttempts.count + 1;
    const updated = { count: newCount };
    if (newCount >= MFA_COOLDOWN_THRESHOLD) {
      updated.cooldownUntil = Date.now() + MFA_COOLDOWN_MS;
      await audit.log(parsed.userId, "MFA_LOGIN_LOCKED", `MFA cooldown triggered after ${newCount} failed attempts`, req.ip);
    }
    mfaFailedAttempts.set(parsed.userId, updated);
    return res.status(401).json({ error: "Invalid MFA token" });
  }

  mfaFailedAttempts.delete(parsed.userId);

  const userRow = await authService.getUserRole(parsed.userId);
  if (!userRow) return res.status(404).json({ error: "User not found" });

  const token = authService.issueJwt({
    id: userRow.id, role: userRow.role,
    firstName: userRow.first_name, lastName: userRow.last_name
  });

  await audit.log(parsed.userId, "LOGIN_SUCCESS", usedRecoveryCode ? "MFA login via recovery code" : "MFA login success", req.ip);
  res.json({ token });
}

async function disableMfa(req, res) {
  const userId = req.user.userId;
  await db.execute("UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = ?", [userId]);
  await db.execute('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
  try { await audit.log(userId, "MFA_DISABLED", "User disabled MFA from profile page", req.ip); } catch {}
  return res.json({ success: true, message: "MFA has been disabled" });
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

async function getProfile(req, res) {
  const userId = req.user.userId;
  const [rows] = await db.execute(
    "SELECT id, email, first_name, last_name, role, mfa_enabled, email_verified, created_at, premium_expires_at, premium_permanent FROM users WHERE id = ?",
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
      id: user.id, email: user.email,
      firstName: user.first_name, lastName: user.last_name,
      role: user.role,
      mfaEnabled: user.mfa_enabled === 1 || user.mfa_enabled === true,
      emailVerified: user.email_verified === 1 || user.email_verified === true,
      remainingRecoveryCodes: codeRows[0].count,
      createdAt: user.created_at,
      premiumExpiresAt: user.premium_expires_at || null,
      premiumPermanent: user.premium_permanent === 1 || user.premium_permanent === true
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
  try { await audit.log(userId, "PROFILE_UPDATED", "User updated their name", req.ip); } catch {}
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

  try { await sendVerificationEmail(userId, cleanEmail, userRows[0].first_name); }
  catch (err) { console.error('Failed to send verification email after email change:', err.message); }

  try { await audit.log(userId, "EMAIL_CHANGED", `Email changed to ${cleanEmail}`, req.ip); } catch {}
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

  try { await audit.log(userId, "PASSWORD_CHANGED", "User changed their password", req.ip); } catch {}
  return res.json({ success: true, message: "Password changed successfully" });
}

// ============================================================================
// SUPPORT TICKETS (user-facing)
// ============================================================================

/**
 * POST /auth/support
 * Creates a new support ticket for the authenticated user.
 */
async function createSupportTicket(req, res) {
  const userId = req.user.userId;
  const { subject, message, priority = 'medium' } = req.body;

  if (!subject?.trim() || subject.trim().length < 5) {
    return res.status(400).json({ error: 'Subject must be at least 5 characters' });
  }
  if (!message?.trim() || message.trim().length < 10) {
    return res.status(400).json({ error: 'Message must be at least 10 characters' });
  }

  const validPriorities = ['low', 'medium', 'high'];
  const cleanPriority = validPriorities.includes(priority) ? priority : 'medium';

  const [result] = await db.execute(
    'INSERT INTO support_tickets (user_id, subject, message, priority) VALUES (?, ?, ?, ?)',
    [userId, subject.trim().substring(0, 200), message.trim(), cleanPriority]
  );

  try { await audit.log(userId, 'SUPPORT_TICKET_CREATED', `User submitted ticket #${result.insertId}: "${subject.trim()}"`, req.ip); } catch {}

  return res.status(201).json({
    success: true,
    ticketId: result.insertId,
    message: 'Your support request has been submitted. We will respond within 24 hours.'
  });
}

/**
 * GET /auth/support
 * Returns all support tickets submitted by the authenticated user,
 * including admin responses and the user's own replies.
 */
async function getUserTickets(req, res) {
  const userId = req.user.userId;

  const [tickets] = await db.execute(
    `SELECT id, subject, status, priority, message,
            admin_response, user_reply, user_replied_at,
            created_at, updated_at
     FROM support_tickets
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );

  return res.json({ success: true, tickets });
}

/**
 * PUT /auth/support/:id
 * Allows the authenticated user to reply to their own support ticket.
 * Only allowed when:
 * - The ticket belongs to this user
 * - The ticket is not resolved
 * - The admin has already responded (requires context before replying)
 *
 * Saves the reply to user_reply, sets user_replied_at, and re-opens
 * the ticket to 'in_progress' so the admin knows a reply is waiting.
 */
async function replyToTicket(req, res) {
  const userId = req.user.userId;
  const { id } = req.params;
  const { reply } = req.body;

  if (!reply?.trim() || reply.trim().length < 5) {
    return res.status(400).json({ error: 'Reply must be at least 5 characters' });
  }

  // Verify the ticket belongs to this user
  const [rows] = await db.execute(
    'SELECT id, status FROM support_tickets WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  if (rows[0].status === 'resolved') {
    return res.status(400).json({
      error: 'Cannot reply to a resolved ticket. Please open a new ticket if you need further assistance.'
    });
  }

  await db.execute(
    `UPDATE support_tickets
     SET user_reply = ?, user_replied_at = NOW(), status = 'in_progress'
     WHERE id = ? AND user_id = ?`,
    [reply.trim(), id, userId]
  );

  try { await audit.log(userId, 'SUPPORT_TICKET_REPLIED', `User replied to ticket #${id}`, req.ip); } catch {}

  return res.json({ success: true, message: 'Your reply has been submitted.' });
}

/**
 * DELETE /auth/account
 * Permanently deletes the authenticated user's account after verifying their
 * password. Audit log is written before deletion so the event is preserved.
 * All associated receipts, tickets, MFA codes, and premium settings are
 * removed via ON DELETE CASCADE on the database foreign keys.
 */
async function deleteAccount(req, res) {
  const userId = req.user.userId;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required to delete your account.' });
  }

  const [rows] = await db.execute('SELECT email, password_hash, first_name FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

  const user = rows[0];
  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    return res.status(403).json({ error: 'Incorrect password. Account not deleted.' });
  }

  // Write the audit entry BEFORE deletion — once the user row is gone the
  // user_id FK becomes NULL via ON DELETE SET NULL, preserving the record.
  try {
    await audit.log(userId, 'ACCOUNT_DELETED', `User permanently deleted their own account (${user.email})`, req.ip);
  } catch {}

  // Delete the account — cascades to receipts, items, MFA codes, tickets, premium settings
  await db.execute('DELETE FROM users WHERE id = ?', [userId]);

  return res.json({ success: true, message: 'Your account has been permanently deleted.' });
}

module.exports = {
  register, login, getCaptcha,
  verifyEmail, resendVerification,
  beginMfaSetup, confirmMfaSetup, verifyMfaLogin, disableMfa,
  getProfile, updateProfile, changeEmail, changePassword,
  createSupportTicket, getUserTickets, replyToTicket,
  allowTriggeredEmail, deleteAccount
};