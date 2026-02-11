/**
 * Environment configuration loader.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const dotenv = require("dotenv");
dotenv.config();

/**
 * Reading a required environment variable and throws if missing.
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || "3001"),

  db: {
    host: requireEnv("DB_HOST"),
    port: Number(process.env.DB_PORT || "3306"),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    name: requireEnv("DB_NAME")
  },

  jwt: {
    secret: requireEnv("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "1h"
  },

  encryption: {
    fieldKeyBase64: requireEnv("FIELD_ENC_KEY_BASE64")
  },

  uploads: {
    dir: process.env.UPLOAD_DIR || "uploads",
    maxFileMb: Number(process.env.MAX_FILE_MB || "10")
  }
};

module.exports = { env, requireEnv };