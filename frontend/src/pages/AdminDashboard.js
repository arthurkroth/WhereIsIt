/**
 * File: AdminDashboard.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * KEY CHANGE: Added Reports navigation card.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Row, Col, Card, Badge,
  Alert, Spinner, Button, Table
} from 'react-bootstrap';
import { getAdminStats } from '../services/api';
import { formatDateTime } from '../utils/format';

// Admin landing page: system stats, navigation cards, and recent admin actions.
function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentActions, setRecentActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Loads dashboard stats on mount.
  useEffect(() => { fetchStats(); }, []);

  // Fetches system-wide stats and the most recent admin actions.
  const fetchStats = async () => {
    setLoading(true); setError('');
    try {
      const response = await getAdminStats();
      setStats(response.data.stats);
      setRecentActions(response.data.recentActions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  // Maps an audit log action to a Bootstrap badge colour.
  const getActionBadgeVariant = (action) => {
    if (!action) return 'secondary';
    if (action.includes('SUSPEND') || action.includes('MFA_RESET')) return 'danger';
    if (action.includes('TIER') || action.includes('PASSWORD')) return 'warning';
    if (action.includes('REACTIVATE')) return 'success';
    if (action.includes('TICKET')) return 'info';
    return 'secondary';
  };

  if (loading) return (
    <Container className="mt-0 text-center py-5">
      <Spinner animation="border" variant="primary" />
      <p className="mt-3 text-muted">Loading dashboard...</p>
    </Container>
  );

  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-0">Admin Dashboard</h2>
          <small className="text-muted">System overview and management</small>
        </div>
        <Button variant="outline-secondary" size="sm" onClick={fetchStats}>↻ Refresh</Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {stats && (
        <>
          {/* Stats cards */}
          <Row className="g-3 mb-4">
            <Col xs={6} md={3}>
              <Card className="text-center h-100 border-primary">
                <Card.Body>
                  <div className="display-6 fw-bold text-primary">{stats.users.total}</div>
                  <div className="text-muted small mt-1">Total Users</div>
                  <div className="mt-2">
                    <Badge bg="secondary" className="me-1">Free: {stats.users.free}</Badge>
                    <Badge bg="warning" text="dark">Premium: {stats.users.premium}</Badge>
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={6} md={3}>
              <Card className="text-center h-100 border-success">
                <Card.Body>
                  <div className="display-6 fw-bold text-success">{stats.receipts.total}</div>
                  <div className="text-muted small mt-1">Total Receipts</div>
                  <div className="mt-2"><Badge bg="success">Stored</Badge></div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={6} md={3}>
              <Card className={`text-center h-100 ${stats.tickets.open > 0 ? 'border-warning' : 'border-secondary'}`}>
                <Card.Body>
                  <div className={`display-6 fw-bold ${stats.tickets.open > 0 ? 'text-warning' : 'text-secondary'}`}>
                    {stats.tickets.open}
                  </div>
                  <div className="text-muted small mt-1">Open Tickets</div>
                  <div className="mt-2">
                    <Badge bg="info">In Progress: {stats.tickets.inProgress}</Badge>
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={6} md={3}>
              <Card className={`text-center h-100 ${stats.users.suspended > 0 ? 'border-danger' : 'border-secondary'}`}>
                <Card.Body>
                  <div className={`display-6 fw-bold ${stats.users.suspended > 0 ? 'text-danger' : 'text-secondary'}`}>
                    {stats.users.suspended}
                  </div>
                  <div className="text-muted small mt-1">Suspended Accounts</div>
                  <div className="mt-2"><Badge bg="secondary">Admins: {stats.users.admin}</Badge></div>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Navigation cards — now includes Reports */}
          <Row className="g-3 mb-4">
            <Col md={3}>
              <Card className="h-100 hover-card" onClick={() => navigate('/admin/users')}>
                <Card.Body className="text-center py-4">
                  <div style={{ fontSize: '2.5rem' }}>👥</div>
                  <h5 className="mt-2 mb-1">Search Users</h5>
                  <small className="text-muted">View and manage user accounts</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card className="h-100 hover-card" onClick={() => navigate('/admin/tickets')}>
                <Card.Body className="text-center py-4">
                  <div style={{ fontSize: '2.5rem' }}>🎫</div>
                  <h5 className="mt-2 mb-1">Support Tickets</h5>
                  <small className="text-muted">
                    {stats.tickets.open > 0
                      ? <span className="text-warning fw-semibold">{stats.tickets.open} open ticket{stats.tickets.open !== 1 ? 's' : ''}</span>
                      : 'No open tickets'}
                  </small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card className="h-100 hover-card" onClick={() => navigate('/admin/audit-logs')}>
                <Card.Body className="text-center py-4">
                  <div style={{ fontSize: '2.5rem' }}>📋</div>
                  <h5 className="mt-2 mb-1">Audit Logs</h5>
                  <small className="text-muted">Monitor system activity</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={3}>
              <Card className="h-100 hover-card" onClick={() => navigate('/admin/reports')}>
                <Card.Body className="text-center py-4">
                  <div style={{ fontSize: '2.5rem' }}>📄</div>
                  <h5 className="mt-2 mb-1">Reports</h5>
                  <small className="text-muted">Schedule and download system reports</small>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Recent admin actions */}
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <strong>Recent Admin Actions</strong>
              <Button variant="link" size="sm" onClick={() => navigate('/admin/audit-logs')}>View all →</Button>
            </Card.Header>
            <Card.Body className="p-0">
              {recentActions.length === 0 ? (
                <div className="text-center py-4 text-muted">No admin actions recorded yet</div>
              ) : (
                <Table hover className="mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Administrator</th>
                      <th>Action</th>
                      <th>Details</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActions.map(action => (
                      <tr key={action.id}>
                        <td><small>{action.first_name} {action.last_name}</small></td>
                        <td>
                          <Badge bg={getActionBadgeVariant(action.action)} style={{ fontSize: '0.7rem' }}>
                            {action.action}
                          </Badge>
                        </td>
                        <td>
                          <small className="text-muted">
                            {action.details?.substring(0, 80)}{action.details?.length > 80 ? '…' : ''}
                          </small>
                        </td>
                        <td><small className="text-muted">{formatDateTime(action.created_at)}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </>
      )}
    </Container>
  );
}

export default AdminDashboard;