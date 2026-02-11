/**
 * Async Handler Utility
 * Author: Arthur Kroth - x22166971
 * Date: 03/10/2026
 * WhereIsIt Project
 */

/**
 * Wrapping async route handlers so errors are passed to Express error middleware.
 * @param {(req:any,res:any,next:any)=>Promise<void>} fn
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

module.exports = { asyncHandler };