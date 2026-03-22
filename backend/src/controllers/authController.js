/**
 * Authentication controller for user registration, login, MFA, and profile management.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { AuthService } = require("../services/authService");
const { AuditLogService } = require("../services/auditLogService");
const bcrypt = require("bcryptjs");
const { db } = require("../config/db");
const {
  registerSchema,
  loginSchema,
  verifyMfaSchema,
  mfaLoginVerifySchema
} = require("../validation/authValidation");

const authService = new AuthService();
const audit = new AuditLogService();

// ============================================================================
// REGISTRATION & LOGIN
// ============================================================================

/**
 * POST /auth/register
 * Creates a new user account with FREE role.
 * PREMIUM role requires payment and cannot be set during registration.
 */
async function register(req, res) {
  const parsed = registerSchema.parse(req.body);

  // Role is always FREE on registration - PREMIUM requires payment (future feature)
  const role = 'FREE';

  const userId = await authService.register(
    parsed.email,
    parsed.password,
    role,
    parsed.firstName,
    parsed.lastName
  );

  await audit.log(userId, "REGISTER", `User registered with role ${role}`);
  res.status(201).json({ userId });
}

/**
 * POST /auth/login
 * Validates credentials and returns a JWT or MFA challenge.
 * If MFA is enabled, returns mfaRequired: true and userId for the next step.
 * If MFA is not enabled, returns a signed JWT with user identity and name.
 */
async function login(req, res) {
  const parsed = loginSchema.parse(req.body);
  const user = await authService.validatePassword(parsed.email, parsed.password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const needsMfa = await authService.requiresMfa(user.id);
  await audit.log(user.id, "LOGIN_ATTEMPT", `MFA enabled: ${needsMfa}`);

  if (needsMfa) {
    return res.json({ mfaRequired: true, userId: user.id });
  }

  const token = authService.issueJwt({
    id: user.id,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name
  });

  return res.json({ mfaRequired: false, token });
}

// ============================================================================
// MFA
// ============================================================================

/**
 * POST /auth/mfa/begin  (requires JWT)
 * Starts MFA setup for the authenticated user.
 * Returns an otpauthUrl to be displayed as a QR code.
 */
async function beginMfaSetup(req, res) {
  const user = req.user;
  const setup = await authService.beginMfaSetup(user.userId);
  await audit.log(user.userId, "MFA_BEGIN", "MFA setup started");
  res.json({ otpauthUrl: setup.otpauthUrl });
}

/**
 * POST /auth/mfa/confirm  (requires JWT)
 * Confirms MFA setup by verifying the first TOTP token from the authenticator app.
 */
async function confirmMfaSetup(req, res) {
  const user = req.user;
  const parsed = verifyMfaSchema.parse(req.body);
  const ok = await authService.confirmMfa(user.userId, parsed.token);
  await audit.log(user.userId, "MFA_CONFIRM", `MFA confirmed: ${ok}`);
  res.json({ success: ok });
}

/**
 * POST /auth/mfa/login-verify
 * Verifies a TOTP token during login and issues a JWT if valid.
 */
async function verifyMfaLogin(req, res) {
  const parsed = mfaLoginVerifySchema.parse(req.body);

  const ok = await authService.verifyMfaForLogin(parsed.userId, parsed.token);
  if (!ok) return res.status(401).json({ error: "Invalid MFA token" });

  const userRow = await authService.getUserRole(parsed.userId);
  if (!userRow) return res.status(404).json({ error: "User not found" });

  const token = authService.issueJwt({
    id: userRow.id,
    role: userRow.role,
    firstName: userRow.first_name,
    lastName: userRow.last_name
  });

  await audit.log(parsed.userId, "LOGIN_SUCCESS", "MFA login success");
  res.json({ token });
}

/**
 * DELETE /auth/mfa  (requires JWT)
 * Disables MFA for the authenticated user.
 * Clears the MFA secret and sets mfa_enabled to false.
 *
 * SECURITY: This is a sensitive action — it should be logged and ideally
 * require the user to confirm with their password before disabling.
 * For now we require the user to be authenticated (valid JWT).
 */
async function disableMfa(req, res) {
  const userId = req.user.userId;

  await db.execute(
    "UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = ?",
    [userId]
  );

  try {
    await audit.log(userId, "MFA_DISABLED", "User disabled MFA from profile page");
  } catch (err) {
    console.log('Audit log skipped:', err.message);
  }

  return res.json({ success: true, message: "MFA has been disabled" });
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * GET /auth/profile  (requires JWT)
 * Returns the authenticated user's profile details.
 * Used to populate the Profile page with current values.
 */
async function getProfile(req, res) {
  const userId = req.user.userId;

  const [rows] = await db.execute(
    "SELECT id, email, first_name, last_name, role, mfa_enabled, created_at FROM users WHERE id = ?",
    [userId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  const user = rows[0];

  return res.json({
    success: true,
    profile: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      mfaEnabled: user.mfa_enabled === 1 || user.mfa_enabled === true,
      createdAt: user.created_at
    }
  });
}

/**
 * PUT /auth/profile  (requires JWT)
 * Updates the authenticated user's first and last name.
 *
 * Body: { firstName: string, lastName: string }
 *
 * SECURITY:
 * - Only name fields can be updated here (email/password have separate endpoints
 *   with additional security checks)
 * - Input is trimmed and length-limited before storage
 */
async function updateProfile(req, res) {
  const userId = req.user.userId;
  const { firstName, lastName } = req.body;

  // Validate name fields
  if (!firstName || !firstName.trim()) {
    return res.status(400).json({ error: "First name is required" });
  }
  if (!lastName || !lastName.trim()) {
    return res.status(400).json({ error: "Last name is required" });
  }

  const cleanFirst = firstName.trim().substring(0, 50);
  const cleanLast = lastName.trim().substring(0, 50);

  await db.execute(
    "UPDATE users SET first_name = ?, last_name = ? WHERE id = ?",
    [cleanFirst, cleanLast, userId]
  );

  try {
    await audit.log(userId, "PROFILE_UPDATED", "User updated their name");
  } catch (err) {
    console.log('Audit log skipped:', err.message);
  }

  return res.json({ success: true, message: "Profile updated successfully" });
}

/**
 * PUT /auth/change-email  (requires JWT)
 * Changes the authenticated user's email address.
 *
 * Body: { newEmail: string, currentPassword: string }
 *
 * SECURITY:
 * - Requires the user's current password to confirm their identity
 *   before making this sensitive change
 * - Checks that the new email is not already in use by another account
 *   to prevent account takeover via email collision
 */
async function changeEmail(req, res) {
  const userId = req.user.userId;
  const { newEmail, currentPassword } = req.body;

  // Validate inputs
  if (!newEmail || !newEmail.trim()) {
    return res.status(400).json({ error: "New email is required" });
  }
  if (!currentPassword) {
    return res.status(400).json({ error: "Current password is required to change email" });
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail.trim())) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // Fetch the current user to verify their password
  const [userRows] = await db.execute(
    "SELECT id, email, password_hash FROM users WHERE id = ?",
    [userId]
  );

  if (userRows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  const user = userRows[0];

  // Verify current password before allowing email change
  const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!passwordValid) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  // Check the new email is not already taken by another account
  const cleanEmail = newEmail.trim().toLowerCase();
  const [existingRows] = await db.execute(
    "SELECT id FROM users WHERE email = ? AND id != ?",
    [cleanEmail, userId]
  );

  if (existingRows.length > 0) {
    return res.status(409).json({ error: "This email address is already in use" });
  }

  // Update the email
  await db.execute(
    "UPDATE users SET email = ? WHERE id = ?",
    [cleanEmail, userId]
  );

  try {
    await audit.log(userId, "EMAIL_CHANGED", `Email changed to ${cleanEmail}`);
  } catch (err) {
    console.log('Audit log skipped:', err.message);
  }

  return res.json({ success: true, message: "Email updated successfully" });
}

/**
 * PUT /auth/change-password  (requires JWT)
 * Changes the authenticated user's password.
 *
 * Body: { currentPassword: string, newPassword: string, confirmPassword: string }
 *
 * SECURITY:
 * - Requires the current password to confirm identity
 * - Enforces the same password strength requirements as registration (min 10 chars)
 * - Hashed with bcrypt at cost factor 12 before storage
 */
async function changePassword(req, res) {
  const userId = req.user.userId;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  // Validate all fields are present
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: "All password fields are required" });
  }

  // New passwords must match
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New passwords do not match" });
  }

  // Enforce minimum length
  if (newPassword.length < 10) {
    return res.status(400).json({ error: "New password must be at least 10 characters" });
  }

  // New password must be different from current
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: "New password must be different from your current password" });
  }

  // Fetch current password hash
  const [userRows] = await db.execute(
    "SELECT id, password_hash FROM users WHERE id = ?",
    [userId]
  );

  if (userRows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  // Verify the current password
  const passwordValid = await bcrypt.compare(currentPassword, userRows[0].password_hash);
  if (!passwordValid) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  // Hash the new password with bcrypt (cost factor 12)
  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  await db.execute(
    "UPDATE users SET password_hash = ? WHERE id = ?",
    [newPasswordHash, userId]
  );

  try {
    await audit.log(userId, "PASSWORD_CHANGED", "User changed their password from profile page");
  } catch (err) {
    console.log('Audit log skipped:', err.message);
  }

  return res.json({ success: true, message: "Password changed successfully" });
}

module.exports = {
  register,
  login,
  beginMfaSetup,
  confirmMfaSetup,
  verifyMfaLogin,
  disableMfa,
  getProfile,
  updateProfile,
  changeEmail,
  changePassword
};