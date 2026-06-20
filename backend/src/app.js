/**
 * Express App Configuration
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { authRoutes } = require("./routes/authRoutes");
const { receiptRoutes } = require('./routes/receiptRoutes');
const { adminRoutes } = require("./routes/adminRoutes");
const { premiumRoutes } = require("./routes/premiumRoutes");
const { errorMiddleware } = require("./middleware/errorMiddleware");
const { env } = require("./config/env");

/**
 * Creates and configures the Express app.
 * Premium routes are registered under /premium and require PREMIUM role.
 */
function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  // Restricted to the app's own public URL — was previously origin: true,
  // which reflected and allowed any origin.
  app.use(cors({ origin: env.appBaseUrl, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 200,
      standardHeaders: "draft-7",
      legacyHeaders: false
    })
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRoutes);
  app.use('/receipts', receiptRoutes);
  app.use("/admin", adminRoutes);
  app.use("/premium", premiumRoutes);

  app.use(errorMiddleware);

  return app;
}

module.exports = { createApp };