/**
 * File: AuthContext.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { createContext, useState, useContext, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext(null);

/**
 * Custom hook to access authentication context.
 * Must be used within an AuthProvider.
 * @returns {Object} Auth context value
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * AuthProvider component that wraps the application.
 * Manages authentication state and provides auth functions to all children.
 * Decodes the JWT to extract userId, role, firstName, and lastName.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Validates and decodes a JWT token.
   * Checks if the token is expired before returning the decoded payload.
   *
   * @param {string} token - JWT token to validate
   * @returns {Object|null} Decoded user data or null if invalid/expired
   */
  const validateToken = (token) => {
    try {
      const decoded = jwtDecode(token);

      // Check if token is expired
      const currentTime = Date.now() / 1000;
      if (decoded.exp && decoded.exp < currentTime) {
        return null;
      }

      return decoded;
    } catch (error) {
      // Token is malformed or invalid
      return null;
    }
  };

  /**
   * Initializes auth state on component mount.
   * Checks for an existing valid token in localStorage.
   * Extracts userId, role, firstName, and lastName from the token payload.
   */
  useEffect(() => {
    const token = localStorage.getItem('token');

    if (token) {
      const decoded = validateToken(token);
      if (decoded) {
        // Token is valid - set user data including name fields
        setUser({
          userId: decoded.userId,
          role: decoded.role,
          firstName: decoded.firstName || '',
          lastName: decoded.lastName || ''
        });
      } else {
        // Token is invalid or expired - remove it
        localStorage.removeItem('token');
      }
    }

    setLoading(false);
  }, []);

  /**
   * Logs in a user by storing their JWT token and updating user state.
   * Extracts userId, role, firstName, and lastName from the token payload.
   *
   * @param {string} token - JWT token from backend
   */
  const loginUser = (token) => {
    localStorage.setItem('token', token);

    const decoded = validateToken(token);
    if (decoded) {
      setUser({
        userId: decoded.userId,
        role: decoded.role,
        firstName: decoded.firstName || '',
        lastName: decoded.lastName || ''
      });
    }
  };

  /**
   * Logs out the current user.
   * Removes token from localStorage and clears user state.
   */
  const logoutUser = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  /**
   * Checks if a user is currently authenticated.
   * @returns {boolean} True if user is logged in
   */
  const isAuthenticated = () => {
    return user !== null;
  };

  /**
   * Checks if the current user has a specific role.
   * @param {string} role - Role to check ("FREE", "PREMIUM", "ADMIN")
   * @returns {boolean} True if user has the role
   */
  const hasRole = (role) => {
    return user?.role === role;
  };

  /**
   * Checks if the current user has any of the specified roles.
   * @param {Array<string>} roles - Array of roles to check
   * @returns {boolean} True if user has any of the roles
   */
  const hasAnyRole = (roles) => {
    return roles.includes(user?.role);
  };

  const value = {
    user,
    loading,
    loginUser,
    logoutUser,
    isAuthenticated,
    hasRole,
    hasAnyRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;