/**
 * File: Admin.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Alert, Spinner, Table, Form, InputGroup } from 'react-bootstrap';
import { getAuditLogs } from '../services/api';

/**
 * Admin panel page component.
 * Displays system audit logs for administrators.
 * 
 * SECURITY NOTES:
 * - Protected by ProtectedRoute with ADMIN role requirement
 * - Displays audit trail of all system actions
 * - Useful for compliance and security monitoring
 * - Includes filtering by action type
 * 
 * Access: ADMIN role only
 */
const Admin = () => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  /**
   * Fetches audit logs on component mount.
   */
  useEffect(() => {
    fetchAuditLogs();
  }, []);

  /**
   * Applies action filter when dependencies change.
   */
  useEffect(() => {
    if (actionFilter === 'all') {
      setFilteredLogs(logs);
    } else {
      setFilteredLogs(logs.filter((log) => log.action === actionFilter));
    }
  }, [logs, actionFilter]);

  /**
   * Fetches all audit logs from the backend.
   */
  const fetchAuditLogs = async () => {
    try {
      const response = await getAuditLogs();
      setLogs(response.data.logs || []);
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to view audit logs.');
      } else {
        setError('Failed to load audit logs');
      }
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Gets unique action types from logs for filter dropdown.
   */

  /**
   * Gets unique action types from logs for filter dropdown.
   */
  const getActionTypes = () => {
    const actions = [...new Set(logs.map((log) => log.action))];
    return actions.sort();
  };

  /**
   * Formats timestamp for display.
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted date/time
   */
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-IE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  /**
   * Gets badge variant based on action type.
   * @param {string} action - Action type
   * @returns {string} Bootstrap variant
   */
  const getActionVariant = (action) => {
    if (action.includes('LOGIN')) return 'primary';
    if (action.includes('REGISTER')) return 'success';
    if (action.includes('MFA')) return 'warning';
    if (action.includes('RECEIPT')) return 'info';
    if (action.includes('FAIL') || action.includes('ERROR')) return 'danger';
    return 'secondary';
  };

  if (loading) {
    return (
      <Container className="main-container">
        <div className="spinner-container">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      </Container>
    );
  }

  return (
    <Container className="main-container">
      <h1 className="mb-4">Admin Panel - Audit Logs</h1>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card className="mb-4">
        <Card.Body>
          <Row className="align-items-center">
            <Col md={6}>
              <h5 className="mb-0">System Audit Trail</h5>
              <p className="text-muted mb-0 mt-1">
                Showing {filteredLogs.length} of {logs.length} log entries
              </p>
            </Col>
            <Col md={6}>
              <InputGroup>
                <InputGroup.Text>Filter by Action</InputGroup.Text>
                <Form.Select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                >
                  <option value="all">All Actions</option>
                  {getActionTypes().map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </Form.Select>
              </InputGroup>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {filteredLogs.length === 0 ? (
        <Alert variant="info">No audit logs found.</Alert>
      ) : (
        <Card>
          <div className="table-responsive">
            <Table striped hover className="mb-0">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Timestamp</th>
                  <th>User ID</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.id}</td>
                    <td>{formatTimestamp(log.created_at)}</td>
                    <td>{log.user_id || 'N/A'}</td>
                    <td>
                      <span className={`badge bg-${getActionVariant(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <small>{log.details}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      <Alert variant="warning" className="mt-4">
        <strong>Security Notice:</strong> Audit logs contain sensitive system information. This
        page is only accessible to administrators. All access to this page is logged.
      </Alert>
    </Container>
  );
};

export default Admin;