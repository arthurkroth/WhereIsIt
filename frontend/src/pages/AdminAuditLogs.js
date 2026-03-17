/**
 * File: AdminAuditLogs.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { Container, Card, Table, Badge, Alert, Spinner, Form, InputGroup, Button } from 'react-bootstrap';
import { getAuditLogs } from '../services/api';

/**
 * AdminAuditLogs Page
 * Displays system audit logs for administrative monitoring and security analysis.
 * 
 * SECURITY:
 * - Requires ADMIN role (enforced by backend and AdminRoute component)
 * - Shows user actions for security monitoring
 * - Helps detect suspicious activity
 * - No sensitive data exposed in logs (per GDPR compliance)
 * 
 * FEATURES:
 * - Lists all audit log entries
 * - Real-time filtering by action type
 * - Search by user ID or details
 * - Color-coded action types
 */
function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');

  /**
   * Fetches audit logs when component mounts.
   */
  useEffect(() => {
    fetchLogs();
  }, []);

  /**
   * Fetches audit logs from backend.
   */
  const fetchLogs = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await getAuditLogs();
      setLogs(response.data.logs || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Applies filters whenever logs or filter criteria change.
   */
  useEffect(() => {
    let filtered = [...logs];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.action.toLowerCase().includes(term) ||
          log.details.toLowerCase().includes(term) ||
          (log.user_id && log.user_id.toString().includes(term))
      );
    }

    // Apply action filter
    if (filterAction !== 'all') {
      filtered = filtered.filter((log) => log.action === filterAction);
    }

    setFilteredLogs(filtered);
  }, [logs, searchTerm, filterAction]);

  /**
   * Gets unique action types from logs for filter dropdown.
   * @returns {Array<string>} Array of unique action types
   */
  const getUniqueActions = () => {
    const actions = logs.map((log) => log.action);
    return [...new Set(actions)].sort();
  };

  /**
   * Returns appropriate Badge variant based on action type.
   * @param {string} action - Action type
   * @returns {string} Bootstrap variant
   */
  const getActionBadgeVariant = (action) => {
    if (action.includes('LOGIN')) return 'success';
    if (action.includes('REGISTER')) return 'info';
    if (action.includes('MFA')) return 'warning';
    if (action.includes('RECEIPT')) return 'primary';
    if (action.includes('FAIL') || action.includes('ERROR')) return 'danger';
    return 'secondary';
  };

  /**
   * Formats timestamp for display.
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted timestamp
   */
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  /**
   * Handles log refresh.
   */
  const handleRefresh = () => {
    fetchLogs();
  };

  return (
    <Container className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <i className="bi bi-shield-lock me-2"></i>
          Audit Logs
        </h2>
        <Button variant="primary" onClick={handleRefresh} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-2"></i>
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError('')} dismissible>
          {error}
        </Alert>
      )}

      {/* Search and Filter Controls */}
      <Card className="mb-4">
        <Card.Body>
          <div className="row g-3">
            <div className="col-md-8">
              <InputGroup>
                <InputGroup.Text>
                  <i className="bi bi-search"></i>
                </InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search by action, user ID, or details..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <Button variant="outline-secondary" onClick={() => setSearchTerm('')}>
                    Clear
                  </Button>
                )}
              </InputGroup>
            </div>
            <div className="col-md-4">
              <Form.Select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
              >
                <option value="all">All Actions</option>
                {getUniqueActions().map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </Form.Select>
            </div>
          </div>
        </Card.Body>
      </Card>

      {loading ? (
        <div className="text-center my-5">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3">Loading audit logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <Card>
          <Card.Body className="text-center py-5">
            <i className="bi bi-file-text display-1 text-muted"></i>
            <h4 className="mt-3">
              {logs.length === 0 ? 'No audit logs yet' : 'No matching logs'}
            </h4>
            <p className="text-muted">
              {logs.length === 0
                ? 'Audit logs will appear here as users interact with the system'
                : 'Try adjusting your search or filter criteria'}
            </p>
          </Card.Body>
        </Card>
      ) : (
        <Card>
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="mb-0">
                <thead className="table-dark">
                  <tr>
                    <th style={{ width: '80px' }}>ID</th>
                    <th style={{ width: '100px' }}>User ID</th>
                    <th style={{ width: '200px' }}>Action</th>
                    <th>Details</th>
                    <th style={{ width: '200px' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <code>#{log.id}</code>
                      </td>
                      <td>
                        {log.user_id ? (
                          <Badge bg="secondary">User {log.user_id}</Badge>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <Badge bg={getActionBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                      </td>
                      <td>
                        <small>{log.details}</small>
                      </td>
                      <td>
                        <small className="text-muted">
                          {formatTimestamp(log.created_at)}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card.Body>
          <Card.Footer className="text-muted">
            Showing {filteredLogs.length} of {logs.length} log entries
          </Card.Footer>
        </Card>
      )}

      <Alert variant="info" className="mt-4">
        <strong>About Audit Logs:</strong> This page displays a record of all significant 
        user actions in the system for security monitoring and compliance purposes. 
        Logs are retained for security analysis and cannot be modified or deleted.
      </Alert>
    </Container>
  );
}

export default AdminAuditLogs;
