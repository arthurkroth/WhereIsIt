/**
 * Authentication Validation Schemas
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { z } = require("zod");

/**
 * Password strength schema used for registration and password changes.
 * Requirements per the Free User use case specification:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

/**
 * Registration schema - validates all fields required to create a new account.
 */
const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100)
});

/**
 * Login schema - minimal validation intentionally.
 * We do not validate email format or password strength on login to prevent
 * information disclosure about what is wrong with the submitted credentials.
 *
 * captchaId and captchaAnswer use .nullish() (accepts undefined AND null) because:
 * - On normal login attempts these fields are simply absent from the request body
 * - After 3 failed attempts the frontend includes them as strings
 * - Using .optional() alone would reject null values and cause a ZodError
 */
const loginSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
  captchaId: z.string().nullish(),
  captchaAnswer: z.string().nullish()
});

/**
 * MFA token schema - used for confirming MFA setup.
 */
const verifyMfaSchema = z.object({
  token: z.string().min(6).max(8)
});

/**
 * MFA login verify schema - used during the login MFA step.
 * Max length is 30 to allow recovery codes (format: XXXXXX-XXXXXX-XXXXXX).
 */
const mfaLoginVerifySchema = z.object({
  userId: z.number().int().positive(),
  token: z.string().min(6).max(30)
});

module.exports = { registerSchema, loginSchema, verifyMfaSchema, mfaLoginVerifySchema, passwordSchema };