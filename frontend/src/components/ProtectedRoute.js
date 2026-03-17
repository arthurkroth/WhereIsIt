/**
 * File: ProtectedRoute.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner, Container } from 'react-bootstrap';


const ProtectedRoute = ({ children, requiredRoles = null }) => {
  const { user, loading, isAuthenticated, hasAnyRole } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // Check role-based access control if roles are specified
  if (requiredRoles && !hasAnyRole(requiredRoles)) {
    // User is authenticated but doesn't have required role
    return (
      <Container className="mt-5">
        <div className="alert alert-danger" role="alert">
          <h4 className="alert-heading">Access Denied</h4>
          <p>You don't have permission to access this page.</p>
          <hr />
          <p className="mb-0">Required role: {requiredRoles.join(' or ')}</p>
          <p className="mb-0">Your role: {user?.role}</p>
        </div>
      </Container>
    );
  }

  // User is authenticated and has required role (if specified)
  return children;
};

export default ProtectedRoute;
