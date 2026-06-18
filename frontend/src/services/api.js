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
// SUPPORT TICKETS (user-facing)
// ============================================================================

export const createSupportTicket = (subject, message, priority = 'medium') =>
  api.post('/auth/support', { subject, message, priority });

export const getUserTickets = () => api.get('/auth/support');

export const replyToSupportTicket = (ticketId, reply) =>
  api.put(`/auth/support/${ticketId}`, { reply });

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
export const updateReceipt = (id, data) => api.put(`/receipts/${id}`, data);
export const deleteReceipt = (id) => api.delete(`/receipts/${id}`);
export const getReceiptFileUrl = (id) => {
  const token = localStorage.getItem('token');
  return `http://localhost:3001/receipts/${id}/file?token=${token}`;
};

// ============================================================================
// PREMIUM
// ============================================================================

export const getPremiumSettings = () => api.get('/premium/settings');
export const updatePremiumSettings = (alertsEnabled, alertTimeframeDays, alertFrequency) =>
  api.put('/premium/settings', { alertsEnabled, alertTimeframeDays, alertFrequency });
export const exportReceiptsCsv = () =>
  api.get('/premium/export/csv', { responseType: 'blob' });
export const sendTestAlert = () => api.post('/premium/alert/test');

// ============================================================================
// ADMIN — Dashboard
// ============================================================================

export const getAdminStats = () => api.get('/admin/stats');

// ============================================================================
// ADMIN — Users
// ============================================================================

export const searchAdminUsers = (q = '', role = 'all', status = 'all') =>
  api.get(`/admin/users?q=${encodeURIComponent(q)}&role=${role}&status=${status}`);
export const getAdminUser = (id) => api.get(`/admin/users/${id}`);
export const adminChangeTier = (id, newTier, reason) =>
  api.put(`/admin/users/${id}/tier`, { newTier, reason });
export const adminSuspendAccount = (id, reason) =>
  api.put(`/admin/users/${id}/suspend`, { reason });
export const adminReactivateAccount = (id, reason) =>
  api.put(`/admin/users/${id}/reactivate`, { reason });
export const adminResetPassword = (id, reason) =>
  api.post(`/admin/users/${id}/reset-password`, { reason });
export const adminResetMfa = (id, justification, adminPassword) =>
  api.delete(`/admin/users/${id}/mfa`, { data: { justification, adminPassword } });

// ============================================================================
// ADMIN — Support Tickets
// ============================================================================

export const getAdminTickets = (status = 'all', priority = 'all') =>
  api.get(`/admin/tickets?status=${status}&priority=${priority}`);
export const getAdminTicket = (id) => api.get(`/admin/tickets/${id}`);
export const updateAdminTicket = (id, response, status) =>
  api.put(`/admin/tickets/${id}`, { response, status });
export const createAdminTicket = (userId, subject, message, priority = 'medium') =>
  api.post('/admin/tickets', { userId, subject, message, priority });

// ============================================================================
// ADMIN — Audit Logs
// ============================================================================

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

export const healthCheck = () => api.get('/health');

export default api;