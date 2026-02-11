/**
 * Server Entry Point
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const { createApp } = require("./app");
const { env } = require("./config/env");
const { dbHealthCheck } = require("./config/db");

/**
 * Starting the server after verifying DB connectivity.
 */
async function start() {
  await dbHealthCheck();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`WhereIsIt backend running on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error("Startup failure:", err);
  process.exit(1);
});