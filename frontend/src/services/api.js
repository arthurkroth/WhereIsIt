/**
 * File: api.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */


import axios from 'axios';

/**
 * API Service for making secure requests to the backend.
 * Handles authentication tokens and provides methods for all backend endpoints.
 * 
 * SECURITY NOTES:
 * - JWT tokens are stored in localStorage (acceptable for this use case)
 * - All requests include Authorization header when authenticated
 * - Axios automatically escapes data to prevent XSS
 * - CORS is handled by backend configuration
 */

// Base URL for API requests (uses proxy from package.json in development)
const API_BASE_URL = '/';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to add JWT token to all requests.
 * This ensures authenticated requests include the Bearer token.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor to handle common errors.
 * Automatically redirects to login on 401 Unauthorized.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If we get a 401, the token is invalid or expired
    if (error.response?.status === 401) {
      // Clear invalid token
      localStorage.removeItem('token');
      // Redirect to login (will be handled by AuthContext)
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

/**
 * Registers a new user account.
 * @param {string} email - User email address
 * @param {string} password - User password (min 10 characters)
 * @param {string} plan - Account plan ("FREE" or "PREMIUM")
 * @returns {Promise} Response with userId
 */
export const register = (email, password, plan = 'FREE') => {
  return api.post('/auth/register', { email, password, plan });
};

/**
 * Logs in a user with email and password.
 * Returns either a JWT token or MFA requirement.
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise} Response with token or mfaRequired flag
 */
export const login = (email, password) => {
  return api.post('/auth/login', { email, password });
};

/**
 * Verifies MFA token during login.
 * @param {number} userId - User ID from initial login
 * @param {string} token - 6-8 digit TOTP token
 * @returns {Promise} Response with JWT token
 */
export const verifyMfaLogin = (userId, token) => {
  return api.post('/auth/mfa/login-verify', { userId, token });
};

/**
 * Begins MFA setup for the authenticated user.
 * Requires valid JWT token.
 * @returns {Promise} Response with otpauthUrl for QR code
 */
export const beginMfaSetup = () => {
  return api.post('/auth/mfa/begin');
};

/**
 * Confirms MFA setup by verifying the first TOTP token.
 * Requires valid JWT token.
 * @param {string} token - 6-8 digit TOTP token
 * @returns {Promise} Response with success status
 */
export const confirmMfaSetup = (token) => {
  return api.post('/auth/mfa/confirm', { token });
};

/**
 * Requests a password reset for the given email.
 * Generates a reset token and (in production) sends an email.
 * SECURITY: Always returns success to prevent email enumeration.
 * @param {string} email - User email address
 * @returns {Promise} Response with success message and (in dev) reset token
 */
export const forgotPassword = (email) => {
  return api.post('/auth/forgot-password', { email });
};

/**
 * Resets password using a valid reset token.
 * @param {string} token - Password reset token (from email or dev response)
 * @param {string} newPassword - New password (min 10 characters)
 * @returns {Promise} Response with success status
 */
export const resetPassword = (token, newPassword) => {
  return api.post('/auth/reset-password', { token, newPassword });
};

// ============================================================================
// RECEIPT ENDPOINTS
// ============================================================================

/**
 * Uploads a receipt file (image or PDF) for OCR processing.
 * Uses multipart/form-data for file upload.
 * Requires authentication.
 * @param {File} file - Receipt file (PNG, JPEG, or PDF)
 * @returns {Promise} Response with receiptId and extracted data
 */
export const uploadReceipt = (file) => {
  const formData = new FormData();
  formData.append('receipt', file);

  return api.post('/receipts/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

/**
 * Creates a receipt manually without file upload.
 * Requires authentication.
 * @param {Object} receiptData - Receipt details
 * @param {string} receiptData.storeName - Store name
 * @param {string} receiptData.purchaseDate - Purchase date (YYYY-MM-DD)
 * @param {string} receiptData.productDescription - Product description
 * @param {number} receiptData.pricePaid - Price paid
 * @param {number} receiptData.warrantyMonths - Warranty duration in months
 * @returns {Promise} Response with receiptId
 */
export const createManualReceipt = (receiptData) => {
  return api.post('/receipts/manual', receiptData);
};

/**
 * Lists all receipts for the authenticated user.
 * Returns decrypted receipt data.
 * Requires authentication.
 * @returns {Promise} Response with array of receipts
 */
export const listReceipts = () => {
  return api.get('/receipts');
};

/**
 * Fetches a single receipt by its ID.
 * Requires authentication.
 * @param {number} id - Receipt ID
 * @returns {Promise} Response with receipt data
 */
export const getReceiptById = (id) => {
  return api.get(`/receipts/${id}`);
};

/**
 * Returns the URL to view the receipt file.
 * The token is appended as a query param because we can't set headers for img src.
 * @param {number} id - Receipt ID
 * @returns {string} URL to the receipt file
 */
export const getReceiptFileUrl = (id) => {
  const token = localStorage.getItem('token');
  return `http://localhost:3001/receipts/${id}/file?token=${token}`;
};

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Retrieves audit logs (ADMIN only).
 * Requires authentication and ADMIN role.
 * @returns {Promise} Response with array of audit log entries
 */
export const getAuditLogs = () => {
  return api.get('/admin/audit-logs');
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Health check endpoint to verify backend connectivity.
 * @returns {Promise} Response with ok status
 */
export const healthCheck = () => {
  return api.get('/health');
};

export default api;