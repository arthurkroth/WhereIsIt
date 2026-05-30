/**
 * Server Entry Point
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { createApp } = require("./app");
const { env } = require("./config/env");
const { dbHealthCheck } = require("./config/db");
const { startWarrantyAlertService } = require("./services/warrantyAlertService");

/**
 * Starts the server after verifying DB connectivity.
 * Also starts the warranty alert background service for Premium users.
 */
async function start() {
  await dbHealthCheck();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`WhereIsIt backend running on http://localhost:${env.port}`);

    // Start the warranty alert cron job for Premium users.
    // Runs daily at midnight UTC — checks for expiring warranties
    // and sends email notifications based on user preferences.
    startWarrantyAlertService();
  });
}

start().catch((err) => {
  console.error("Startup failure:", err);
  process.exit(1);
});