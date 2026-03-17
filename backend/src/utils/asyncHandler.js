/**
 * Async Handler Utility
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

/**
 * AsyncHandler Utility
 * Wraps async route handlers to automatically catch errors and pass them to Express error middleware.
 * This prevents having to write try-catch blocks in every controller function.
 * 
 * @param {Function} fn - Async function to wrap (controller function)
 * @returns {Function} Express middleware function
 * 
 * USAGE:
 * router.post('/endpoint', asyncHandler(async (req, res) => {
 *   // Your async code here
 *   // Errors automatically caught and passed to error middleware
 * }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    // Execute the function and catch any errors
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };