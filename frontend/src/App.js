/**
 * File: App.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import NavigationBar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import MfaVerify from './pages/MfaVerify';
import Dashboard from './pages/Dashboard';
import MfaSetup from './pages/MfaSetup';
import ReceiptUpload from './pages/ReceiptUpload';
import ReceiptManual from './pages/ReceiptManual';
import ReceiptList from './pages/ReceiptList';
import AdminAuditLogs from './pages/AdminAuditLogs';
import 'bootstrap/dist/css/bootstrap.min.css';
import ReceiptDetail from './pages/ReceiptDetail';


/**
 * Main App component that sets up routing and authentication context.
 * All routes are wrapped in AuthProvider to manage user authentication state.
 */
function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <NavigationBar />
          <div className="container mt-4">
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/mfa-verify" element={<MfaVerify />} />

              {/* Protected routes - require authentication */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/mfa-setup"
                element={
                  <ProtectedRoute>
                    <MfaSetup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/receipts"
                element={
                  <ProtectedRoute>
                    <ReceiptList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/receipt/upload"
                element={
                  <ProtectedRoute>
                    <ReceiptUpload />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/receipt/manual"
                element={
                  <ProtectedRoute>
                    <ReceiptManual />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/receipts/:id"
                element={
                  <ProtectedRoute>
                    <ReceiptDetail />
                  </ProtectedRoute>
                }
              />
              {/* Admin-only routes */}
              <Route
                path="/admin/audit-logs"
                element={
                  <AdminRoute>
                    <AdminAuditLogs />
                  </AdminRoute>
                }
              />

              {/* Default redirect */}
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