/**
 * Server Entry Point
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

const { createApp } = require("./app");
const { env } = require("./config/env");
const { dbHealthCheck } = require("./config/db");
const { startWarrantyAlertService } = require("./services/warrantyAlertService");
const { startReportScheduler } = require("./services/reportService");

/**
 * Starts the server after verifying DB connectivity.
 * Also starts the warranty alert and report scheduler background services.
 */
async function start() {
  await dbHealthCheck();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`WhereIsIt backend running on http://localhost:${env.port}`);

    // Start warranty alert cron — runs daily at midnight UTC
    startWarrantyAlertService();

    // Start report scheduler cron — runs daily at 01:00 UTC
    // Checks the report_schedule table and generates a report when due
    startReportScheduler();
  });
}

start().catch((err) => {
  console.error("Startup failure:", err);
  process.exit(1);
});