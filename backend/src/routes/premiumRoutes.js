/**
 * Premium Routes
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * All routes under /premium/ - each requires JWT authentication
 * and Premium (or Admin) role enforced by the requirePremium middleware.
 */

const { Router } = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  requirePremium,
  getSettings,
  updateSettings,
  exportCsv,
  sendTestAlert
} = require('../controllers/premiumController');

const premiumRoutes = Router();

// All premium routes require authentication first, then Premium role check
premiumRoutes.use(requireAuth);
premiumRoutes.use(requirePremium);

// GET  /premium/settings — fetch warranty alert preferences
premiumRoutes.get('/settings', asyncHandler(getSettings));

// PUT  /premium/settings — update warranty alert preferences
premiumRoutes.put('/settings', asyncHandler(updateSettings));

// GET  /premium/export/csv — download receipts as CSV file
premiumRoutes.get('/export/csv', asyncHandler(exportCsv));

// POST /premium/alert/test — manually trigger a test warranty alert
premiumRoutes.post('/alert/test', asyncHandler(sendTestAlert));

module.exports = { premiumRoutes };