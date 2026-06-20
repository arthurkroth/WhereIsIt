/**
 * File: Sidebar.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Left-hand sidebar navigation, replacing the previous top Navbar.
 * Shows role-based links (user, Premium, Admin) and a logout action.
 */

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Badge, Button } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';

// Single sidebar nav item, highlighted when the current route matches its path.
function SidebarLink({ to, icon, label, isActive }) {
  return (
    <Link to={to} className={`sidebar-link${isActive ? ' active' : ''}`}>
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

// Renders the left sidebar: brand, role-aware navigation links, and logout.
function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logoutUser } = useAuth();

  // Logs the user out and redirects to the login page.
  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  // Returns true when the current path starts with the given route prefix.
  const isActive = (path) => location.pathname.startsWith(path);

  const isPremium = user?.role === 'PREMIUM';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <nav className="app-sidebar">
      <Link to="/dashboard" className="sidebar-brand">WhereIsIt?</Link>

      <div className="sidebar-nav">
        <SidebarLink to="/dashboard" icon="🏠" label="Dashboard" isActive={isActive('/dashboard')} />
        <SidebarLink to="/receipts" icon="📄" label="My Receipts" isActive={isActive('/receipts')} />
        <SidebarLink to="/receipt/upload" icon="⬆" label="Upload Receipt" isActive={isActive('/receipt/upload')} />
        <SidebarLink to="/profile" icon="👤" label="Profile" isActive={isActive('/profile')} />

        {isAdmin && (
          <>
            <div className="sidebar-section-label">Admin</div>
            <SidebarLink to="/admin/dashboard" icon="📊" label="Dashboard" isActive={location.pathname === '/admin/dashboard'} />
            <SidebarLink to="/admin/users" icon="👥" label="User Management" isActive={isActive('/admin/users')} />
            <SidebarLink to="/admin/tickets" icon="🎫" label="Support Tickets" isActive={isActive('/admin/tickets')} />
            <SidebarLink to="/admin/audit-logs" icon="📋" label="Audit Logs" isActive={isActive('/admin/audit-logs')} />
            <SidebarLink to="/admin/reports" icon="🗎" label="Reports" isActive={isActive('/admin/reports')} />
          </>
        )}
      </div>

      <div className="sidebar-footer">
        {isPremium && (
          <Badge bg="success" className="mb-2 d-block text-center">★ Premium</Badge>
        )}
        {isAdmin && (
          <Badge bg="danger" className="mb-2 d-block text-center">Admin</Badge>
        )}
        <Button variant="outline-light" size="sm" className="w-100" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </nav>
  );
}

export default Sidebar;
