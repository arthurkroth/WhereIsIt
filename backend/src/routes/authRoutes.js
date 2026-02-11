/**
 * Authentication routes for user registration, login, and MFA management.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { Router } = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  register,
  login,
  beginMfaSetup,
  confirmMfaSetup,
  verifyMfaLogin
} = require("../controllers/authController");

const authRoutes = Router();

authRoutes.post("/register", asyncHandler(register));
authRoutes.post("/login", asyncHandler(login));
authRoutes.post("/mfa/login-verify", asyncHandler(verifyMfaLogin));

authRoutes.post("/mfa/begin", requireAuth, asyncHandler(beginMfaSetup));
authRoutes.post("/mfa/confirm", requireAuth, asyncHandler(confirmMfaSetup));

module.exports = { authRoutes };