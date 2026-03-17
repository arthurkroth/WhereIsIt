/**
 * File: AuthContext.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
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
 * Manages authentication state and provides auth functions to children.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Validates and decodes a JWT token.
   * Checks if token is expired.
   * @param {string} token - JWT token to validate
   * @returns {Object|null} Decoded user data or null if invalid
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
   * Checks for existing token in localStorage.
   */
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (token) {
      const decoded = validateToken(token);
      if (decoded) {
        // Token is valid, set user data
        setUser({
          userId: decoded.userId,
          role: decoded.role,
        });
      } else {
        // Token is invalid or expired, remove it
        localStorage.removeItem('token');
      }
    }
    
    setLoading(false);
  }, []);

  /**
   * Logs in a user by storing their JWT token.
   * Extracts user data from token payload.
   * @param {string} token - JWT token from backend
   */
  const loginUser = (token) => {
    localStorage.setItem('token', token);
    
    const decoded = validateToken(token);
    if (decoded) {
      setUser({
        userId: decoded.userId,
        role: decoded.role,
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
   * Checks if user is authenticated.
   * @returns {boolean} True if user is logged in
   */
  const isAuthenticated = () => {
    return user !== null;
  };

  /**
   * Checks if user has a specific role.
   * @param {string} role - Role to check ("FREE", "PREMIUM", "ADMIN")
   * @returns {boolean} True if user has the role
   */
  const hasRole = (role) => {
    return user?.role === role;
  };

  /**
   * Checks if user has any of the specified roles.
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
