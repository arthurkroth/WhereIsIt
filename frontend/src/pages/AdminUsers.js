/**
 * File: AdminUsers.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Admin user search and list page.
 * Allows admins to search by name, email or user ID,
 * and filter by role and account status.
 * Clicking a row navigates to AdminUserDetail.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Card, Table, Badge, Button,
  Alert, Spinner, InputGroup, Form, Row, Col
} from 'react-bootstrap';
import { searchAdminUsers } from '../services/api';
import { formatDate } from '../utils/format';

// Admin user search/listing page; clicking a row opens AdminUserDetail.
function AdminUsers() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Load all users on mount
  useEffect(() => { fetchUsers(); }, []);

  // Fetches users matching the given search term, role, and status filters.
  const fetchUsers = async (q = '', role = 'all', status = 'all') => {
    setLoading(true); setError('');
    try {
      const response = await searchAdminUsers(q, role, status);
      setUsers(response.data.users || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Submits the search form with the current filter values.
  const handleSearch = (e) => {
    e.preventDefault();
    fetchUsers(searchTerm, roleFilter, statusFilter);
  };

  // Resets all filters and reloads the full user list.
  const handleClear = () => {
    setSearchTerm(''); setRoleFilter('all'); setStatusFilter('all');
    fetchUsers('', 'all', 'all');
  };

  // Renders a coloured badge for a user's role.
  const getRoleBadge = (role) => {
    if (role === 'PREMIUM') return <Badge bg="warning" text="dark">PREMIUM</Badge>;
    if (role === 'ADMIN')   return <Badge bg="danger">ADMIN</Badge>;
    return <Badge bg="secondary">FREE</Badge>;
  };

  // Renders a coloured badge for a user's account status.
  const getStatusBadge = (status) => {
    if (status === 'suspended') return <Badge bg="danger">Suspended</Badge>;
    return <Badge bg="success">Active</Badge>;
  };

  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <Button variant="outline-secondary" size="sm" className="me-3"
            onClick={() => navigate('/admin/dashboard')}>← Dashboard</Button>
          <strong className="fs-4">User Management</strong>
        </div>
        <small className="text-muted">{users.length} result{users.length !== 1 ? 's' : ''}</small>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {/* Search and filter bar */}
      <Card className="mb-4">
        <Card.Body>
          <Form noValidate onSubmit={handleSearch}>
            <Row className="g-2 align-items-end">
              <Col md={5}>
                <InputGroup>
                  <Form.Control
                    type="text"
                    placeholder="Search by name, email, or user ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <Button variant="outline-secondary" onClick={handleClear}>✕</Button>
                  )}
                </InputGroup>
              </Col>
              <Col md={2}>
                <Form.Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="all">All Roles</option>
                  <option value="FREE">Free</option>
                  <option value="PREMIUM">Premium</option>
                  <option value="ADMIN">Admin</option>
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </Form.Select>
              </Col>
              <Col md={2}>
                <Button variant="primary" type="submit" className="w-100" disabled={loading}>
                  {loading ? <Spinner as="span" animation="border" size="sm" /> : 'Search'}
                </Button>
              </Col>
              <Col md={1}>
                <Button variant="outline-secondary" className="w-100" onClick={handleClear}>Clear</Button>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      {/* Users table */}
      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3">Loading users...</p>
        </div>
      ) : users.length === 0 ? (
        <Card>
          <Card.Body className="text-center py-5">
            <h5>No users found</h5>
            <p className="text-muted">Try adjusting your search or filter criteria.</p>
            <Button variant="outline-secondary" onClick={handleClear}>Clear Filters</Button>
          </Card.Body>
        </Card>
      ) : (
        <Card>
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="mb-0">
                <thead className="table-dark">
                  <tr>
                    <th style={{ width: '60px' }}>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>MFA</th>
                    <th>Verified</th>
                    <th>Registered</th>
                    <th style={{ width: '80px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/admin/users/${user.id}`)}>
                      <td><code>#{user.id}</code></td>
                      <td>{user.first_name} {user.last_name}</td>
                      <td>{user.email}</td>
                      <td>{getRoleBadge(user.role)}</td>
                      <td>{getStatusBadge(user.status)}</td>
                      <td>
                        {user.mfaEnabled
                          ? <Badge bg="success">On</Badge>
                          : <Badge bg="warning" text="dark">Off</Badge>}
                      </td>
                      <td>
                        {user.emailVerified
                          ? <Badge bg="success">Yes</Badge>
                          : <Badge bg="secondary">No</Badge>}
                      </td>
                      <td><small className="text-muted">{formatDate(user.created_at)}</small></td>
                      <td>
                        <Button variant="outline-primary" size="sm"
                          onClick={(e) => { e.stopPropagation(); navigate(`/admin/users/${user.id}`); }}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card.Body>
          <Card.Footer className="text-muted">
            Showing {users.length} user{users.length !== 1 ? 's' : ''}
          </Card.Footer>
        </Card>
      )}
    </Container>
  );
}

export default AdminUsers;