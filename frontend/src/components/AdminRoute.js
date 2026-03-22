/**
 * File: AdminRoute.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';


function AdminRoute({ children }) {
  const { isAuthenticated, hasRole } = useAuth();

  // Check if user is authenticated
  if (!isAuthenticated()) {
    // Not logged in, redirect to login page
    return <Navigate to="/login" replace />;
  }

  // Check if user has ADMIN role
  if (!hasRole('ADMIN')) {
    // Not an admin, redirect to dashboard with access denied message
    return (
      <Navigate 
        to="/dashboard" 
        replace 
        state={{ error: 'Access denied. Admin privileges required.' }}
      />
    );
  }

  // User is authenticated and is an admin, render the protected component
  return children;
}

export default AdminRoute;
