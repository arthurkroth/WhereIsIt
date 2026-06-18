/**
 * File: App.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Navbar from './components/Navbar';

// Public pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import MfaVerify from './pages/MfaVerify';
import VerifyEmail from './pages/VerifyEmail';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';

// Protected user pages
import Dashboard from './pages/Dashboard';
import ReceiptList from './pages/ReceiptList';
import ReceiptUpload from './pages/ReceiptUpload';
import ReceiptManual from './pages/ReceiptManual';
import ReceiptDetail from './pages/ReceiptDetail';
import Profile from './pages/Profile';

// Admin pages
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminSupportTickets from './pages/AdminSupportTickets';
import AdminAuditLogs from './pages/AdminAuditLogs';
import AdminReports from './pages/AdminReports';

/**
 * HomeRedirect — sends admins to /admin/dashboard, everyone else to /dashboard.
 */
function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/dashboard" replace />;
}

/**
 * DashboardRoute — redirects admins away from the user dashboard.
 */
function DashboardRoute() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
  return <ProtectedRoute><Dashboard /></ProtectedRoute>;
}

function AppContent() {
  const { user } = useAuth();

  return (
    <>
      {user && <Navbar />}
      <div style={{ paddingTop: user ? '1.5rem' : '0' }}>
        <Routes>
          {/* Public routes */}
          <Route path="/login"           element={<Login />} />
          <Route path="/register"        element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/mfa-verify"      element={<MfaVerify />} />
          <Route path="/verify-email"    element={<VerifyEmail />} />
          <Route path="/terms"           element={<Terms />} />
          <Route path="/privacy"         element={<Privacy />} />

          {/* User dashboard */}
          <Route path="/dashboard"       element={<DashboardRoute />} />

          {/* Protected user routes */}
          <Route path="/receipts"        element={<ProtectedRoute><ReceiptList /></ProtectedRoute>} />
          <Route path="/receipt/upload"  element={<ProtectedRoute><ReceiptUpload /></ProtectedRoute>} />
          <Route path="/receipt/manual"  element={<ProtectedRoute><ReceiptManual /></ProtectedRoute>} />
          <Route path="/receipts/:id"    element={<ProtectedRoute><ReceiptDetail /></ProtectedRoute>} />
          <Route path="/profile"         element={<ProtectedRoute><Profile /></ProtectedRoute>} />

          {/* Admin routes */}
          <Route path="/admin/dashboard"  element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/users"      element={<AdminRoute><AdminUsers /></AdminRoute>} />
          <Route path="/admin/users/:id"  element={<AdminRoute><AdminUserDetail /></AdminRoute>} />
          <Route path="/admin/tickets"    element={<AdminRoute><AdminSupportTickets /></AdminRoute>} />
          <Route path="/admin/audit-logs" element={<AdminRoute><AdminAuditLogs /></AdminRoute>} />
          <Route path="/admin/reports"    element={<AdminRoute><AdminReports /></AdminRoute>} />

          {/* Default redirects */}
          <Route path="/"  element={<HomeRedirect />} />
          <Route path="*"  element={<HomeRedirect />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;