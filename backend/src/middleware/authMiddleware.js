/**
 * Authentication and Role-Based Access Control (RBAC) middleware.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

/**
 * Validating JWT and attaching {userId, role} to req.user.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    req.user = decoded; // { userId, role }
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Enforcing RBAC roles FREE / PREMIUM / ADMIN.
 * @param {Array<"FREE"|"PREMIUM"|"ADMIN">} roles
 */
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    return next();
  };
}

module.exports = { requireAuth, requireRole };