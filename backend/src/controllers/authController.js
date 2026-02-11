/**
 * Authentication controller for user registration, login, and MFA management.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { AuthService } = require("../services/authService");
const { AuditLogService } = require("../services/auditLogService");
const {
  registerSchema,
  loginSchema,
  verifyMfaSchema,
  mfaLoginVerifySchema
} = require("../validation/authValidation");

const authService = new AuthService();
const audit = new AuditLogService();

/**
 * POST /auth/register
 */
async function register(req, res) {
  const parsed = registerSchema.parse(req.body);
  const userId = await authService.register(parsed.email, parsed.password, parsed.plan);
  await audit.log(userId, "REGISTER", `User registered with role ${parsed.plan}`);
  res.status(201).json({ userId });
}

/**
 * POST /auth/login
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

  const token = authService.issueJwt({ id: user.id, role: user.role });
  return res.json({ mfaRequired: false, token });
}

/**
 * POST /auth/mfa/begin  (requires JWT)
 */
async function beginMfaSetup(req, res) {
  const user = req.user;
  const setup = await authService.beginMfaSetup(user.userId);
  await audit.log(user.userId, "MFA_BEGIN", "MFA setup started");
  res.json({ otpauthUrl: setup.otpauthUrl });
}

/**
 * POST /auth/mfa/confirm  (requires JWT)
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
 * Body: { userId, token }
 * Returns JWT if token is correct.
 */
async function verifyMfaLogin(req, res) {
  const parsed = mfaLoginVerifySchema.parse(req.body);

  const ok = await authService.verifyMfaForLogin(parsed.userId, parsed.token);
  if (!ok) return res.status(401).json({ error: "Invalid MFA token" });

  const userRow = await authService.getUserRole(parsed.userId);
  if (!userRow) return res.status(404).json({ error: "User not found" });

  const token = authService.issueJwt({ id: userRow.id, role: userRow.role });
  await audit.log(parsed.userId, "LOGIN_SUCCESS", "MFA login success");
  res.json({ token });
}

module.exports = { register, login, beginMfaSetup, confirmMfaSetup, verifyMfaLogin };