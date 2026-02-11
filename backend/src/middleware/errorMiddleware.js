/**
 * Central error handler to avoid leaking internal errors.
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */


function errorMiddleware(err, _req, res, _next) {
  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({ error: "Internal Server Error", message });
}

module.exports = { errorMiddleware };