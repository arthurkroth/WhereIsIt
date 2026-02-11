/**
 * Authentication Validation Schemas
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { z } = require("zod");

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
  plan: z.enum(["FREE", "PREMIUM"]).default("FREE")
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const verifyMfaSchema = z.object({
  token: z.string().min(6).max(8)
});

const mfaLoginVerifySchema = z.object({
  userId: z.number().int().positive(),
  token: z.string().min(6).max(8)
});

module.exports = { registerSchema, loginSchema, verifyMfaSchema, mfaLoginVerifySchema };