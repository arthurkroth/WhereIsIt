/**
 * File: Navbar.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * KEY CHANGE: Added Reports link to admin dropdown.
 */

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Navbar as BsNavbar, Nav, Container,
  Button, Badge, NavDropdown
} from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logoutUser } = useAuth();

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  const isActive = (path) => location.pathname.startsWith(path);

  const isPremium = user?.role === 'PREMIUM';
  const isAdmin   = user?.role === 'ADMIN';

  return (
    <BsNavbar bg="dark" variant="dark" expand="lg" sticky="top">
      <Container>
        <BsNavbar.Brand as={Link} to="/dashboard" className="fw-bold">
          WhereIsIt?
        </BsNavbar.Brand>

        <BsNavbar.Toggle aria-controls="main-navbar" />
        <BsNavbar.Collapse id="main-navbar">

          <Nav className="me-auto">
            <Nav.Link as={Link} to="/dashboard"
              className={isActive('/dashboard') ? 'active' : ''}>
              Dashboard
            </Nav.Link>
            <Nav.Link as={Link} to="/receipts"
              className={isActive('/receipts') ? 'active' : ''}>
              My Receipts
            </Nav.Link>
            <Nav.Link as={Link} to="/receipt/upload"
              className={isActive('/receipt/upload') ? 'active' : ''}>
              Upload Receipt
            </Nav.Link>
            <Nav.Link as={Link} to="/profile"
              className={isActive('/profile') ? 'active' : ''}>
              Profile
            </Nav.Link>

            {/* Admin dropdown — visible to ADMIN role only */}
            {isAdmin && (
              <NavDropdown
                title="Admin Panel"
                id="admin-dropdown"
                className={isActive('/admin') ? 'active' : ''}
              >
                <NavDropdown.Item as={Link} to="/admin/dashboard">
                  Dashboard
                </NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/admin/users">
                  User Management
                </NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/admin/tickets">
                  Support Tickets
                </NavDropdown.Item>
                <NavDropdown.Item as={Link} to="/admin/audit-logs">
                  Audit Logs
                </NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item as={Link} to="/admin/reports">
                  Reports
                </NavDropdown.Item>
              </NavDropdown>
            )}
          </Nav>

          <Nav className="align-items-center gap-2">
            {isPremium && (
              <Nav.Link as={Link} to="/profile" className="text-warning fw-semibold pe-0">
                Premium Account | PREMIUM
              </Nav.Link>
            )}
            {isAdmin && (
              <Badge bg="danger" className="me-1">ADMIN</Badge>
            )}
            <Button variant="outline-light" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </Nav>

        </BsNavbar.Collapse>
      </Container>
    </BsNavbar>
  );
}

export default Navbar;