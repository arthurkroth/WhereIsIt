/**
 * Express App Configuration
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { authRoutes } = require("./routes/authRoutes");
const { receiptRoutes } = require('./routes/receiptRoutes');
const { adminRoutes } = require("./routes/adminRoutes");
const { errorMiddleware } = require("./middleware/errorMiddleware");

/**
 * Creating and configuring the Express app.
 */
function createApp() {
  const app = express();

  // Trust the first proxy hop - required for express-rate-limit to work correctly
  // without this, rate limiting throws a ValidationError on startup
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
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

  app.use(errorMiddleware);

  return app;
}

module.exports = { createApp };