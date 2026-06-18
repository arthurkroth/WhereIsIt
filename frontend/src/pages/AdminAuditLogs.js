/**
 * File: AdminAuditLogs.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Enhanced admin audit log viewer.
 * Replaces the previous basic version with:
 * - Date range filter
 * - Event type filter (dropdown of unique actions)
 * - User ID search
 * - Entry limit selector (50 / 100 / 250 / 500)
 * - Severity colour-coding (critical, security, info)
 * - Admin action highlighting
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Card, Table, Badge, Button,
  Alert, Spinner, Form, InputGroup, Row, Col
} from 'react-bootstrap';
import { getAuditLogs } from '../services/api';

function AdminAuditLogs() {
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState('100');

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    setLoading(true); setError('');
    try {
      const response = await getAuditLogs({
        q: searchTerm, action: actionFilter, userId, dateFrom, dateTo, limit
      });
      setLogs(response.data.logs || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = (e) => {
    e.preventDefault();
    fetchLogs();
  };

  const handleClearFilters = () => {
    setSearchTerm(''); setActionFilter('');
    setUserId(''); setDateFrom(''); setDateTo(''); setLimit('100');
    // Fetch with cleared values immediately
    setLoading(true);
    getAuditLogs({ limit: '100' })
      .then(r => setLogs(r.data.logs || []))
      .catch(() => setError('Failed to load logs'))
      .finally(() => setLoading(false));
  };

  // Get unique action types for the filter dropdown
  const uniqueActions = [...new Set(logs.map(l => l.action))].sort();

  /**
   * Classifies an action string into a severity level.
   * Used to colour-code rows and badges.
   */
  const getSeverity = (action) => {
    if (!action) return 'info';
    const a = action.toUpperCase();
    if (a.includes('SUSPEND') || a.includes('MFA_RESET') || a.includes('FAIL') ||
        a.includes('CAPTCHA') || a.includes('ERROR')) return 'critical';
    if (a.includes('ADMIN_') || a.includes('PASSWORD') || a.includes('MFA') ||
        a.includes('LOGIN')) return 'security';
    return 'info';
  };

  const getActionBadgeVariant = (action) => {
    const sev = getSeverity(action);
    if (sev === 'critical') return 'danger';
    if (sev === 'security') return 'warning';
    return 'secondary';
  };

  const getRowClass = (action) => {
    const sev = getSeverity(action);
    if (sev === 'critical') return 'table-danger';
    if (sev === 'security') return 'table-warning';
    return '';
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const hasActiveFilters = searchTerm || actionFilter || userId || dateFrom || dateTo || limit !== '100';

  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <Button variant="outline-secondary" size="sm" className="me-3"
            onClick={() => navigate('/admin/dashboard')}>← Dashboard</Button>
          <strong className="fs-4">Audit Logs</strong>
        </div>
        <Button variant="outline-secondary" size="sm" onClick={fetchLogs} disabled={loading}>
          ↻ Refresh
        </Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {/* Severity legend */}
      <div className="d-flex gap-3 mb-3 align-items-center">
        <small className="text-muted fw-semibold">Severity:</small>
        <span className="badge bg-danger">Critical (suspensions, failures)</span>
        <span className="badge bg-warning text-dark">Security (admin actions, logins, MFA)</span>
        <span className="badge bg-secondary">Info (standard user actions)</span>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <Card.Body>
          <Form noValidate onSubmit={handleApplyFilters}>
            <Row className="g-2 mb-2">
              <Col md={4}>
                <Form.Label className="small fw-semibold">Search</Form.Label>
                <InputGroup>
                  <Form.Control type="text" placeholder="Search actions or details..."
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  {searchTerm && <Button variant="outline-secondary" onClick={() => setSearchTerm('')}>✕</Button>}
                </InputGroup>
              </Col>
              <Col md={3}>
                <Form.Label className="small fw-semibold">Event Type</Form.Label>
                <Form.Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                  <option value="">All Events</option>
                  {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Label className="small fw-semibold">User ID</Form.Label>
                <Form.Control type="number" placeholder="User ID"
                  value={userId} onChange={(e) => setUserId(e.target.value)} />
              </Col>
              <Col md={1}>
                <Form.Label className="small fw-semibold">Limit</Form.Label>
                <Form.Select value={limit} onChange={(e) => setLimit(e.target.value)}>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="250">250</option>
                  <option value="500">500</option>
                </Form.Select>
              </Col>
            </Row>
            <Row className="g-2">
              <Col md={3}>
                <Form.Label className="small fw-semibold">Date From</Form.Label>
                <Form.Control type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </Col>
              <Col md={3}>
                <Form.Label className="small fw-semibold">Date To</Form.Label>
                <Form.Control type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </Col>
              <Col md={2} className="d-flex align-items-end gap-2">
                <Button variant="primary" type="submit" disabled={loading}>Apply</Button>
                {hasActiveFilters && (
                  <Button variant="outline-secondary" onClick={handleClearFilters} disabled={loading}>Clear</Button>
                )}
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3">Loading audit logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <Card.Body className="text-center py-5">
            <h5>{hasActiveFilters ? 'No matching logs' : 'No audit logs yet'}</h5>
            <p className="text-muted">
              {hasActiveFilters
                ? 'Try adjusting your filters.'
                : 'Audit logs will appear here as users interact with the system.'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline-secondary" onClick={handleClearFilters}>Clear Filters</Button>
            )}
          </Card.Body>
        </Card>
      ) : (
        <Card>
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover size="sm" className="mb-0">
                <thead className="table-dark">
                  <tr>
                    <th style={{ width: '60px' }}>ID</th>
                    <th style={{ width: '100px' }}>User</th>
                    <th style={{ width: '220px' }}>Action</th>
                    <th>Details</th>
                    <th style={{ width: '120px' }}>IP</th>
                    <th style={{ width: '180px' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className={getRowClass(log.action)}>
                      <td><code style={{ fontSize: '0.75rem' }}>#{log.id}</code></td>
                      <td>
                        {log.user_id ? (
                          <Button variant="link" size="sm" className="p-0 text-decoration-none"
                            style={{ fontSize: '0.8rem' }}
                            onClick={() => navigate(`/admin/users/${log.user_id}`)}>
                            #{log.user_id}
                            {log.first_name && <span className="text-muted ms-1">({log.first_name})</span>}
                          </Button>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        <Badge bg={getActionBadgeVariant(log.action)} style={{ fontSize: '0.65rem', wordBreak: 'break-all' }}>
                          {log.action}
                        </Badge>
                      </td>
                      <td><small style={{ fontSize: '0.8rem' }}>{log.details}</small></td>
                      <td><small className="text-muted font-monospace" style={{ fontSize: '0.75rem' }}>{log.ip_address || '—'}</small></td>
                      <td><small className="text-muted" style={{ fontSize: '0.75rem' }}>{formatDate(log.created_at)}</small></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card.Body>
          <Card.Footer className="text-muted">
            Showing {logs.length} log entr{logs.length !== 1 ? 'ies' : 'y'}
            {hasActiveFilters && ' (filtered)'}
          </Card.Footer>
        </Card>
      )}
    </Container>
  );
}

export default AdminAuditLogs;