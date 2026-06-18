/**
 * Authentication and Role-Based Access Control (RBAC) middleware.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * CHANGE: requireRole now logs UNAUTHORIZED_ACCESS_ATTEMPT to audit_logs
 * when a user with an insufficient role tries to access a protected route.
 */

const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { db } = require("../config/db");

/**
 * Validates the JWT and attaches { userId, role, firstName, lastName } to req.user.
 * Accepts token from Authorization header (Bearer) or ?token= query param (file downloads).
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "").trim()
    : queryToken || null;

  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Enforces RBAC by checking that req.user.role is in the allowed roles array.
 * If the role check fails, the attempt is logged to audit_logs before returning 403.
 * Logging failures are silently caught so they never cause a 500 error.
 *
 * @param {Array<"FREE"|"PREMIUM"|"ADMIN">} roles - Roles permitted to access the route
 */
function requireRole(roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    if (!roles.includes(req.user.role)) {
      // Log the unauthorized attempt before rejecting
      // This satisfies the admin spec requirement for security event logging
      try {
        await db.execute(
          "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)",
          [
            req.user.userId || null,
            'UNAUTHORIZED_ACCESS_ATTEMPT',
            `User (role: ${req.user.role}) attempted to access ${req.path} — required role: ${roles.join(', ')}`,
            req.ip || null
          ]
        );
      } catch (err) {
        // Never let audit logging failure break the request flow
        console.error('Failed to log unauthorized access attempt:', err.message);
      }

      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
}

module.exports = { requireAuth, requireRole };