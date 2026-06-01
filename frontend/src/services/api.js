/**
 * API Service using Axios for making HTTP requests to the backend.
 * Handles authentication tokens and provides methods for all API endpoints.
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import axios from 'axios';

const API_BASE_URL = '/';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

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
// AUTHENTICATION
// ============================================================================

export const register = (email, password, plan = 'FREE', firstName, lastName) =>
  api.post('/auth/register', { email, password, firstName, lastName });

export const login = (email, password, captchaId = null, captchaAnswer = null) => {
  const body = { email, password };
  if (captchaId) body.captchaId = captchaId;
  if (captchaAnswer !== null && captchaAnswer !== '') body.captchaAnswer = captchaAnswer;
  return api.post('/auth/login', body);
};

export const getCaptcha = () => api.get('/auth/captcha');
export const verifyEmail = (token) => api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);
export const resendVerification = (email) => api.post('/auth/resend-verification', { email });
export const verifyMfaLogin = (userId, token) => api.post('/auth/mfa/login-verify', { userId, token });
export const beginMfaSetup = () => api.post('/auth/mfa/begin');
export const confirmMfaSetup = (token) => api.post('/auth/mfa/confirm', { token });
export const disableMfa = () => api.delete('/auth/mfa');
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token, newPassword) => api.post('/auth/reset-password', { token, newPassword });

// ============================================================================
// PROFILE
// ============================================================================

export const getProfile = () => api.get('/auth/profile');
export const updateProfile = (firstName, lastName) => api.put('/auth/profile', { firstName, lastName });
export const changeEmail = (newEmail, currentPassword) => api.put('/auth/change-email', { newEmail, currentPassword });
export const changePassword = (currentPassword, newPassword, confirmPassword) =>
  api.put('/auth/change-password', { currentPassword, newPassword, confirmPassword });

// ============================================================================
// RECEIPTS
// ============================================================================

export const uploadReceipt = (file) => {
  const formData = new FormData();
  formData.append('receipt', file);
  return api.post('/receipts/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const createManualReceipt = (receiptData) => api.post('/receipts/manual', receiptData);
export const listReceipts = () => api.get('/receipts');
export const getReceiptById = (id) => api.get(`/receipts/${id}`);
export const getReceiptFileUrl = (id) => {
  const token = localStorage.getItem('token');
  return `http://localhost:3001/receipts/${id}/file?token=${token}`;
};

// ============================================================================
// PREMIUM
// ============================================================================

/**
 * Fetches the Premium user's warranty alert preferences.
 * @returns {Promise} Response with settings object
 */
export const getPremiumSettings = () => api.get('/premium/settings');

/**
 * Updates the Premium user's warranty alert preferences.
 * @param {boolean} alertsEnabled
 * @param {number} alertTimeframeDays - 7, 14, 30, 60, or 90
 * @param {string} alertFrequency - 'daily', 'weekly', or 'immediate'
 */
export const updatePremiumSettings = (alertsEnabled, alertTimeframeDays, alertFrequency) =>
  api.put('/premium/settings', { alertsEnabled, alertTimeframeDays, alertFrequency });

/**
 * Triggers a CSV export download of all receipts.
 * Returns binary CSV data — must be handled with a blob download in the frontend.
 */
export const exportReceiptsCsv = () =>
  api.get('/premium/export/csv', { responseType: 'blob' });

/**
 * Triggers a manual test warranty alert email.
 * Useful for testing the alert system during development.
 */
export const sendTestAlert = () => api.post('/premium/alert/test');

// ============================================================================
// ADMIN
// ============================================================================

export const getAuditLogs = () => api.get('/admin/audit-logs');

// ============================================================================
// HEALTH
// ============================================================================

export const healthCheck = () => api.get('/health');

export default api;