/**
 * File: App.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import NavigationBar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import MfaVerify from './pages/MfaVerify';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import MfaSetup from './pages/MfaSetup';
import ReceiptUpload from './pages/ReceiptUpload';
import ReceiptManual from './pages/ReceiptManual';
import ReceiptList from './pages/ReceiptList';
import ReceiptDetail from './pages/ReceiptDetail';
import AdminAuditLogs from './pages/AdminAuditLogs';
import 'bootstrap/dist/css/bootstrap.min.css';

// Session timeout: 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * SessionManager component
 * Silently logs the user out after SESSION_TIMEOUT_MS of inactivity.
 * Monitors: mousemove, keydown, click, scroll, touchstart.
 */
function SessionManager() {
  const { isAuthenticated, logoutUser } = useAuth();
  const timerRef = useRef(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isAuthenticated()) {
      timerRef.current = setTimeout(() => {
        console.log('Session expired due to inactivity');
        logoutUser();
        window.location.href = '/login';
      }, SESSION_TIMEOUT_MS);
    }
  }, [isAuthenticated, logoutUser]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    resetTimer();
    events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [resetTimer]);

  return null;
}

/**
 * Main App component.
 * Sets up routing, authentication context, and session management.
 */
function App() {
  return (
    <AuthProvider>
      <Router>
        <SessionManager />
        <div className="App">
          <NavigationBar />
          <div className="mt-4">
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/mfa-verify" element={<MfaVerify />} />

              {/* Protected routes */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/mfa-setup" element={<ProtectedRoute><MfaSetup /></ProtectedRoute>} />
              <Route path="/receipts" element={<ProtectedRoute><ReceiptList /></ProtectedRoute>} />
              <Route path="/receipt/upload" element={<ProtectedRoute><ReceiptUpload /></ProtectedRoute>} />
              <Route path="/receipt/manual" element={<ProtectedRoute><ReceiptManual /></ProtectedRoute>} />
              <Route path="/receipts/:id" element={<ProtectedRoute><ReceiptDetail /></ProtectedRoute>} />

              {/* Admin-only routes */}
              <Route path="/admin/audit-logs" element={<AdminRoute><AdminAuditLogs /></AdminRoute>} />

              {/* Default redirects */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;