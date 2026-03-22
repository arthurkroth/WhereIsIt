/**
 * File: api.js
 * Author: Arthur Kroth - x22166971
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

const API_BASE_URL = '/';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to add JWT token to all requests.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor to handle common errors.
 * Redirects to login on 401 Unauthorized, but not for the login endpoint itself.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginEndpoint = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginEndpoint) {
      localStorage.removeItem('token');
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
 * @param {string} email
 * @param {string} password
 * @param {string} plan - Always 'FREE' on registration
 * @param {string} firstName
 * @param {string} lastName
 * @returns {Promise}
 */
export const register = (email, password, plan = 'FREE', firstName, lastName) => {
  return api.post('/auth/register', { email, password, firstName, lastName });
};

/**
 * Logs in a user with email and password.
 * Returns either a JWT token or an MFA requirement.
 * @param {string} email
 * @param {string} password
 * @returns {Promise}
 */
export const login = (email, password) => {
  return api.post('/auth/login', { email, password });
};

/**
 * Verifies MFA token during login.
 * @param {number} userId
 * @param {string} token - 6-digit TOTP token
 * @returns {Promise}
 */
export const verifyMfaLogin = (userId, token) => {
  return api.post('/auth/mfa/login-verify', { userId, token });
};

/**
 * Begins MFA setup for the authenticated user.
 * @returns {Promise} Response with otpauthUrl for QR code
 */
export const beginMfaSetup = () => {
  return api.post('/auth/mfa/begin');
};

/**
 * Confirms MFA setup by verifying the first TOTP token.
 * @param {string} token - 6-digit TOTP token
 * @returns {Promise}
 */
export const confirmMfaSetup = (token) => {
  return api.post('/auth/mfa/confirm', { token });
};

/**
 * Disables MFA for the authenticated user.
 * @returns {Promise}
 */
export const disableMfa = () => {
  return api.delete('/auth/mfa');
};

/**
 * Requests a password reset email for the given address.
 * SECURITY: Always returns success to prevent email enumeration.
 * @param {string} email
 * @returns {Promise}
 */
export const forgotPassword = (email) => {
  return api.post('/auth/forgot-password', { email });
};

/**
 * Resets password using a valid reset token.
 * @param {string} token
 * @param {string} newPassword
 * @returns {Promise}
 */
export const resetPassword = (token, newPassword) => {
  return api.post('/auth/reset-password', { token, newPassword });
};

// ============================================================================
// PROFILE ENDPOINTS
// ============================================================================

/**
 * Fetches the authenticated user's profile details.
 * Used to populate the Profile page with current values.
 * @returns {Promise} Response with profile object
 */
export const getProfile = () => {
  return api.get('/auth/profile');
};

/**
 * Updates the authenticated user's name fields.
 * @param {string} firstName
 * @param {string} lastName
 * @returns {Promise}
 */
export const updateProfile = (firstName, lastName) => {
  return api.put('/auth/profile', { firstName, lastName });
};

/**
 * Changes the authenticated user's email address.
 * Requires the current password for security confirmation.
 * @param {string} newEmail
 * @param {string} currentPassword
 * @returns {Promise}
 */
export const changeEmail = (newEmail, currentPassword) => {
  return api.put('/auth/change-email', { newEmail, currentPassword });
};

/**
 * Changes the authenticated user's password.
 * Requires the current password before allowing the change.
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} confirmPassword
 * @returns {Promise}
 */
export const changePassword = (currentPassword, newPassword, confirmPassword) => {
  return api.put('/auth/change-password', { currentPassword, newPassword, confirmPassword });
};

// ============================================================================
// RECEIPT ENDPOINTS
// ============================================================================

/**
 * Uploads a receipt file (image or PDF) for OCR processing.
 * @param {File} file
 * @returns {Promise} Response with receiptId and extractedData (including items array)
 */
export const uploadReceipt = (file) => {
  const formData = new FormData();
  formData.append('receipt', file);
  return api.post('/receipts/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Creates a receipt manually without file upload.
 * @param {Object} receiptData - { storeName, purchaseDate, totalPrice, warrantyMonths, items[] }
 * @returns {Promise}
 */
export const createManualReceipt = (receiptData) => {
  return api.post('/receipts/manual', receiptData);
};

/**
 * Lists all receipts for the authenticated user.
 * @returns {Promise}
 */
export const listReceipts = () => {
  return api.get('/receipts');
};

/**
 * Fetches a single receipt by its ID, including all its items.
 * @param {number} id
 * @returns {Promise}
 */
export const getReceiptById = (id) => {
  return api.get(`/receipts/${id}`);
};

/**
 * Returns the URL to view the receipt file.
 * Token is in the query param because browser tags cannot set Authorization headers.
 * @param {number} id
 * @returns {string}
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
 * @returns {Promise}
 */
export const getAuditLogs = () => {
  return api.get('/admin/audit-logs');
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Health check endpoint to verify backend connectivity.
 * @returns {Promise}
 */
export const healthCheck = () => {
  return api.get('/health');
};

export default api;