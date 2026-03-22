/**
 * File: Navbar.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React from 'react';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * NavigationBar component shown on every page.
 * Displays navigation links and the current user's name and role.
 * Shows different links depending on authentication and role status.
 *
 * CHANGES:
 * - "MFA Setup" link replaced with "Profile" which includes MFA management
 *   alongside account details and password change.
 */
const NavigationBar = () => {
  const { user, isAuthenticated, logoutUser, hasRole } = useAuth();
  const navigate = useNavigate();

  /**
   * Handles user logout.
   * Clears authentication state and redirects to login page.
   */
  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  /**
   * Returns a display name for the current user.
   * Shows "First Last" if both names are available, otherwise falls back gracefully.
   * @returns {string} Display name
   */
  const getDisplayName = () => {
    const first = user?.firstName || '';
    const last = user?.lastName || '';
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    return 'User';
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
      <Container>
        <Navbar.Brand as={Link} to="/">
          WhereIsIt?
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            {isAuthenticated() && (
              <>
                <Nav.Link as={Link} to="/dashboard">
                  Dashboard
                </Nav.Link>
                <Nav.Link as={Link} to="/receipts">
                  My Receipts
                </Nav.Link>
                <Nav.Link as={Link} to="/receipt/upload">
                  Upload Receipt
                </Nav.Link>
                {/* Profile replaces the old standalone MFA Setup link */}
                <Nav.Link as={Link} to="/profile">
                  Profile
                </Nav.Link>
                {hasRole('ADMIN') && (
                  <Nav.Link as={Link} to="/admin/audit-logs">
                    Audit Logs
                  </Nav.Link>
                )}
              </>
            )}
          </Nav>
          <Nav>
            {isAuthenticated() ? (
              <>
                <Navbar.Text className="me-3">
                  {getDisplayName()} | {user?.role}
                </Navbar.Text>
                <Button variant="outline-light" size="sm" onClick={handleLogout}>
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Nav.Link as={Link} to="/login">
                  Login
                </Nav.Link>
                <Nav.Link as={Link} to="/register">
                  Register
                </Nav.Link>
              </>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default NavigationBar;