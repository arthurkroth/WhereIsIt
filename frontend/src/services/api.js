/**
 * File: api.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import axios from 'axios';

const API_BASE_URL = '/';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Request interceptor — attaches JWT token to every request.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor — redirects to login on 401 (except from the login endpoint itself).
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
// AUTHENTICATION
// ============================================================================

export const register = (email, password, plan = 'FREE', firstName, lastName) =>
  api.post('/auth/register', { email, password, firstName, lastName });

/**
 * Logs in a user with email and password.
 * Captcha fields are only included when they have a value —
 * sending null would fail Zod .optional() validation on the backend.
 */
export const login = (email, password, captchaId = null, captchaAnswer = null) => {
  const body = { email, password };
  if (captchaId) body.captchaId = captchaId;
  if (captchaAnswer !== null && captchaAnswer !== '') body.captchaAnswer = captchaAnswer;
  return api.post('/auth/login', body);
};

export const getCaptcha = () => api.get('/auth/captcha');

/**
 * Verifies an email address using the token from the verification link.
 * Called automatically by the VerifyEmail page when it loads.
 * @param {string} token - Plain-text token from URL query parameter
 */
export const verifyEmail = (token) =>
  api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);

/**
 * Resends the verification email to the given address.
 * Called when a user tries to log in with an unverified account.
 * @param {string} email
 */
export const resendVerification = (email) =>
  api.post('/auth/resend-verification', { email });

export const verifyMfaLogin = (userId, token) =>
  api.post('/auth/mfa/login-verify', { userId, token });

export const beginMfaSetup = () => api.post('/auth/mfa/begin');

export const confirmMfaSetup = (token) => api.post('/auth/mfa/confirm', { token });

export const disableMfa = () => api.delete('/auth/mfa');

export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });

export const resetPassword = (token, newPassword) =>
  api.post('/auth/reset-password', { token, newPassword });

// ============================================================================
// PROFILE
// ============================================================================

export const getProfile = () => api.get('/auth/profile');

export const updateProfile = (firstName, lastName) =>
  api.put('/auth/profile', { firstName, lastName });

export const changeEmail = (newEmail, currentPassword) =>
  api.put('/auth/change-email', { newEmail, currentPassword });

export const changePassword = (currentPassword, newPassword, confirmPassword) =>
  api.put('/auth/change-password', { currentPassword, newPassword, confirmPassword });

// ============================================================================
// RECEIPTS
// ============================================================================

export const uploadReceipt = (file) => {
  const formData = new FormData();
  formData.append('receipt', file);
  return api.post('/receipts/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const createManualReceipt = (receiptData) => api.post('/receipts/manual', receiptData);

export const listReceipts = () => api.get('/receipts');

export const getReceiptById = (id) => api.get(`/receipts/${id}`);

export const getReceiptFileUrl = (id) => {
  const token = localStorage.getItem('token');
  return `http://localhost:3001/receipts/${id}/file?token=${token}`;
};

// ============================================================================
// ADMIN
// ============================================================================

export const getAuditLogs = () => api.get('/admin/audit-logs');

// ============================================================================
// HEALTH
// ============================================================================

export const healthCheck = () => api.get('/health');

export default api;