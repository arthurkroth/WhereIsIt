/**
 * Database configuration and connection pool setup.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

const mysql = require("mysql2/promise");
const { env } = require("./env");

const db = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  connectionLimit: 10
});

/**
 * Running a DB query to verify connectivity.
 * @returns {Promise<void>}
 */
async function dbHealthCheck() {
  await db.query("SELECT 1");
}

module.exports = { db, dbHealthCheck };
