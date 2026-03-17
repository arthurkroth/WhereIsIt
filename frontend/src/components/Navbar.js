/**
 * File: Navbar.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */


import React from 'react';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';


const NavigationBar = () => {
  const { user, isAuthenticated, logoutUser, hasRole } = useAuth();
  const navigate = useNavigate();

  /**
   * Handles user logout.
   * Clears authentication state and redirects to login.
   */
  const handleLogout = () => {
    logoutUser();
    navigate('/login');
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
                <Nav.Link as={Link} to="/mfa-setup">
                  MFA Setup
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
                  User: {user?.userId} | Role: {user?.role}
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
