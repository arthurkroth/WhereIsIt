/**
 * File: api.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import axios from 'axios';

// Determines the backend base URL automatically depending on where the app is running.
// - On localhost (local development), the backend runs on a different port (3001),
//   so requests must go directly to http://localhost:3001.
// - On any other host (production, e.g. whereisit.ie), requests use a relative path
//   so they go through nginx, which proxies them to the backend on the same domain.
// This means the SAME code works locally and in production with no manual editing
// after every deployment.
const getApiBaseUrl = () => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocalhost ? 'http://localhost:3001' : '';
};

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attaches the stored JWT (if any) as a Bearer token on every outgoing request.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Clears the stored token and redirects to login on any 401 outside the login flow itself.
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

// Creates a new FREE-tier account.
export const register = (email, password, plan = 'FREE', firstName, lastName) =>
  api.post('/auth/register', { email, password, firstName, lastName });

// Logs in with email/password, optionally including a CAPTCHA answer.
export const login = (email, password, captchaId = null, captchaAnswer = null) => {
  const body = { email, password };
  if (captchaId) body.captchaId = captchaId;
  if (captchaAnswer !== null && captchaAnswer !== '') body.captchaAnswer = captchaAnswer;
  return api.post('/auth/login', body);
};

// Fetches a new math CAPTCHA challenge.
export const getCaptcha = () => api.get('/auth/captcha');
// Verifies an email address using the token from the verification email link.
export const verifyEmail = (token) => api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);
// Requests a fresh verification email for an unverified account.
export const resendVerification = (email) => api.post('/auth/resend-verification', { email });
// Verifies an MFA token/recovery code to complete login.
export const verifyMfaLogin = (userId, token) => api.post('/auth/mfa/login-verify', { userId, token });
// Starts MFA setup and requests the otpauth URL/QR code.
export const beginMfaSetup = () => api.post('/auth/mfa/begin');
// Confirms MFA setup with the first TOTP code.
export const confirmMfaSetup = (token) => api.post('/auth/mfa/confirm', { token });
// Disables MFA on the current account.
export const disableMfa = () => api.delete('/auth/mfa');
// Requests a password reset email.
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });
// Resets the password using a valid reset token.
export const resetPassword = (token, newPassword) => api.post('/auth/reset-password', { token, newPassword });

// ============================================================================
// PROFILE
// ============================================================================

// Fetches the current user's profile.
export const getProfile = () => api.get('/auth/profile');
// Updates the current user's name.
export const updateProfile = (firstName, lastName) => api.put('/auth/profile', { firstName, lastName });
// Changes the current user's email after verifying their password.
export const changeEmail = (newEmail, currentPassword) => api.put('/auth/change-email', { newEmail, currentPassword });
// Changes the current user's password.
export const changePassword = (currentPassword, newPassword, confirmPassword) =>
  api.put('/auth/change-password', { currentPassword, newPassword, confirmPassword });

// ============================================================================
// SUPPORT TICKETS (user-facing)
// ============================================================================

// Submits a new support ticket.
export const createSupportTicket = (subject, message, priority = 'medium') =>
  api.post('/auth/support', { subject, message, priority });

// Fetches the current user's own support tickets.
export const getUserTickets = () => api.get('/auth/support');

// Replies to one of the user's own support tickets.
export const replyToSupportTicket = (ticketId, reply) =>
  api.put(`/auth/support/${ticketId}`, { reply });

// ============================================================================
// RECEIPTS
// ============================================================================

// Uploads a receipt file for OCR processing.
export const uploadReceipt = (file) => {
  const formData = new FormData();
  formData.append('receipt', file);
  return api.post('/receipts/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// Creates a receipt from manually entered data (no file).
export const createManualReceipt = (receiptData) => api.post('/receipts/manual', receiptData);
// Lists all receipts for the current user.
export const listReceipts = () => api.get('/receipts');
// Fetches a single receipt's full details.
export const getReceiptById = (id) => api.get(`/receipts/${id}`);
// Updates a receipt's header, items, notes, and tags.
export const updateReceipt = (id, data) => api.put(`/receipts/${id}`, data);
// Deletes a receipt and its attached file.
export const deleteReceipt = (id) => api.delete(`/receipts/${id}`);

// Builds the authenticated URL used to view/download a receipt's attached file.
// Uses the same environment-aware base URL as the rest of the API client,
// so this works correctly both on localhost and in production.
export const getReceiptFileUrl = (id) => {
  const token = localStorage.getItem('token');
  return `${API_BASE_URL}/receipts/${id}/file?token=${token}`;
};

// ============================================================================
// PREMIUM
// ============================================================================

// Fetches the Premium user's warranty alert preferences.
export const getPremiumSettings = () => api.get('/premium/settings');
// Updates the Premium user's warranty alert preferences.
export const updatePremiumSettings = (alertsEnabled, alertTimeframeDays, alertFrequency) =>
  api.put('/premium/settings', { alertsEnabled, alertTimeframeDays, alertFrequency });
// Exports all of the Premium user's receipts as a CSV file.
export const exportReceiptsCsv = () =>
  api.get('/premium/export/csv', { responseType: 'blob' });
// Sends a one-off test warranty alert email.
export const sendTestAlert = () => api.post('/premium/alert/test');

// ============================================================================
// ADMIN — Dashboard
// ============================================================================

// Fetches system-wide stats and recent admin actions.
export const getAdminStats = () => api.get('/admin/stats');

// ============================================================================
// ADMIN — Users
// ============================================================================

// Searches users by name/email/ID, optionally filtered by role and status.
export const searchAdminUsers = (q = '', role = 'all', status = 'all') =>
  api.get(`/admin/users?q=${encodeURIComponent(q)}&role=${role}&status=${status}`);
// Fetches a single user's full admin detail record.
export const getAdminUser = (id) => api.get(`/admin/users/${id}`);
// Changes a user's FREE/PREMIUM tier.
export const adminChangeTier = (id, newTier, reason) =>
  api.put(`/admin/users/${id}/tier`, { newTier, reason });
// Suspends a user account.
export const adminSuspendAccount = (id, reason) =>
  api.put(`/admin/users/${id}/suspend`, { reason });
// Reactivates a suspended user account.
export const adminReactivateAccount = (id, reason) =>
  api.put(`/admin/users/${id}/reactivate`, { reason });
// Triggers a password reset email for a user.
export const adminResetPassword = (id, reason) =>
  api.post(`/admin/users/${id}/reset-password`, { reason });
// Resets a user's MFA, requiring the admin's own password as confirmation.
export const adminResetMfa = (id, justification, adminPassword) =>
  api.delete(`/admin/users/${id}/mfa`, { data: { justification, adminPassword } });

// ============================================================================
// ADMIN — Support Tickets
// ============================================================================

// Lists support tickets, optionally filtered by status and priority.
export const getAdminTickets = (status = 'all', priority = 'all') =>
  api.get(`/admin/tickets?status=${status}&priority=${priority}`);
// Fetches a single ticket's full detail.
export const getAdminTicket = (id) => api.get(`/admin/tickets/${id}`);
// Saves an admin's response and/or status change on a ticket.
export const updateAdminTicket = (id, response, status) =>
  api.put(`/admin/tickets/${id}`, { response, status });
// Creates a test ticket on behalf of a given user.
export const createAdminTicket = (userId, subject, message, priority = 'medium') =>
  api.post('/admin/tickets', { userId, subject, message, priority });

// ============================================================================
// ADMIN — Audit Logs
// ============================================================================

// Fetches audit logs matching the given filter object.
export const getAuditLogs = (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
  return api.get(`/admin/audit-logs?${params.toString()}`);
};

// ============================================================================
// ADMIN — Reports
// ============================================================================

/** Returns the current report schedule settings. */
export const getReportSchedule = () => api.get('/admin/reports/schedule');

/**
 * Updates the report schedule settings.
 * @param {boolean} enabled
 * @param {string} frequency - 'daily' | 'weekly' | 'monthly'
 */
export const updateReportSchedule = (enabled, frequency) =>
  api.put('/admin/reports/schedule', { enabled, frequency });

/** Generates a report on demand immediately. */
export const generateReport = () => api.post('/admin/reports/generate');

/** Lists all saved .log report files. */
export const listReports = () => api.get('/admin/reports');

/**
 * Downloads a specific .log report file as a blob.
 * @param {string} filename - Exact filename from listReports response
 */
export const downloadReport = (filename) =>
  api.get(`/admin/reports/download/${encodeURIComponent(filename)}`, { responseType: 'blob' });

// ============================================================================
// HEALTH
// ============================================================================

// Pings the backend health check endpoint.
export const healthCheck = () => api.get('/health');

export default api;