/**
 * File: AdminSupportTickets.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * KEY CHANGE: Ticket detail modal now shows the user's reply (user_reply)
 * between the original message and the admin response form, so the admin
 * can see what the user replied before responding again.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Card, Table, Badge, Button,
  Alert, Spinner, Modal, Form, Row, Col
} from 'react-bootstrap';
import {
  getAdminTickets, getAdminTicket, updateAdminTicket, createAdminTicket
} from '../services/api';
import { formatDateTime } from '../utils/format';

// Admin support ticket inbox: list, filter, respond to, and create tickets.
function AdminSupportTickets() {
  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Ticket detail modal
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [respondLoading, setRespondLoading] = useState(false);
  const [respondError, setRespondError] = useState('');

  // Create test ticket modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ userId: '', subject: '', message: '', priority: 'medium' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Reloads tickets whenever the status or priority filter changes.
  useEffect(() => { fetchTickets(); }, [statusFilter, priorityFilter]);

  // Fetches tickets matching the current status/priority filters.
  const fetchTickets = async () => {
    setLoading(true); setError('');
    try {
      const response = await getAdminTickets(statusFilter, priorityFilter);
      setTickets(response.data.tickets || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  // Loads a single ticket's full detail and opens the detail modal.
  const handleViewTicket = async (ticketId) => {
    setLoadingTicket(true); setRespondError('');
    try {
      const response = await getAdminTicket(ticketId);
      setSelectedTicket(response.data.ticket);
      setResponseText('');
      setNewStatus(response.data.ticket.status);
      setShowDetailModal(true);
    } catch {
      setError('Failed to load ticket details');
    } finally {
      setLoadingTicket(false);
    }
  };

  // Saves the admin's response and/or status change for the selected ticket.
  const handleRespond = async () => {
    if (!responseText.trim() && newStatus === selectedTicket.status) {
      setRespondError('Please add a response or change the status'); return;
    }
    setRespondLoading(true); setRespondError('');
    try {
      await updateAdminTicket(selectedTicket.id, responseText.trim(), newStatus);
      setSuccessMsg(`Ticket #${selectedTicket.id} updated successfully`);
      setShowDetailModal(false);
      fetchTickets();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setRespondError(err.response?.data?.error || 'Failed to update ticket');
    } finally {
      setRespondLoading(false);
    }
  };

  // Creates a test support ticket on behalf of a given user ID.
  const handleCreateTicket = async () => {
    if (!createForm.userId || !createForm.subject || !createForm.message) {
      setCreateError('All fields are required'); return;
    }
    setCreateLoading(true); setCreateError('');
    try {
      await createAdminTicket(parseInt(createForm.userId), createForm.subject, createForm.message, createForm.priority);
      setSuccessMsg('Test ticket created successfully');
      setShowCreateModal(false);
      setCreateForm({ userId: '', subject: '', message: '', priority: 'medium' });
      fetchTickets();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create ticket');
    } finally {
      setCreateLoading(false);
    }
  };

  // Renders a coloured badge for a ticket's status.
  const getStatusBadge = (status) => {
    if (status === 'open')        return <Badge bg="danger">Open</Badge>;
    if (status === 'in_progress') return <Badge bg="warning" text="dark">In Progress</Badge>;
    if (status === 'resolved')    return <Badge bg="success">Resolved</Badge>;
    return <Badge bg="secondary">{status}</Badge>;
  };

  // Renders a coloured badge for a ticket's priority.
  const getPriorityBadge = (priority) => {
    if (priority === 'high')   return <Badge bg="danger">High</Badge>;
    if (priority === 'medium') return <Badge bg="warning" text="dark">Medium</Badge>;
    return <Badge bg="secondary">Low</Badge>;
  };

  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <Button variant="outline-secondary" size="sm" className="me-3"
            onClick={() => navigate('/admin/dashboard')}>← Dashboard</Button>
          <strong className="fs-4">Support Tickets</strong>
        </div>
        <Button variant="outline-primary" size="sm" onClick={() => setShowCreateModal(true)}>
          + Create Test Ticket
        </Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {successMsg && (
        <Alert variant="success" dismissible onClose={() => setSuccessMsg('')}>
          {successMsg}
        </Alert>
      )}

      {/* Filters */}
      <Card className="mb-4">
        <Card.Body>
          <Row className="g-2">
            <Col md={3}>
              <Form.Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Button variant="outline-secondary" onClick={fetchTickets} disabled={loading}>Refresh</Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3">Loading tickets...</p>
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <Card.Body className="text-center py-5">
            <h5>No tickets found</h5>
            <p className="text-muted">Try a different filter or create a test ticket.</p>
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
                    <th>Subject</th>
                    <th>User</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>User Reply</th>
                    <th>Created</th>
                    <th style={{ width: '80px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(ticket => (
                    <tr key={ticket.id} style={{ cursor: 'pointer' }}
                      onClick={() => handleViewTicket(ticket.id)}>
                      <td><code>#{ticket.id}</code></td>
                      <td>{ticket.subject}</td>
                      <td>
                        <div>{ticket.first_name} {ticket.last_name}</div>
                        <small className="text-muted">{ticket.email}</small>
                      </td>
                      <td>{getStatusBadge(ticket.status)}</td>
                      <td>{getPriorityBadge(ticket.priority)}</td>
                      <td>
                        {/* Flag if the user has sent a reply awaiting admin attention */}
                        {ticket.user_reply
                          ? <Badge bg="info">Replied</Badge>
                          : <span className="text-muted small">—</span>}
                      </td>
                      <td><small className="text-muted">{formatDateTime(ticket.created_at)}</small></td>
                      <td>
                        <Button variant="outline-primary" size="sm"
                          onClick={(e) => { e.stopPropagation(); handleViewTicket(ticket.id); }}
                          disabled={loadingTicket}>
                          {loadingTicket ? <Spinner as="span" animation="border" size="sm" /> : 'Open'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card.Body>
          <Card.Footer className="text-muted">
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
          </Card.Footer>
        </Card>
      )}

      {/* Ticket Detail Modal */}
      <Modal show={showDetailModal} onHide={() => setShowDetailModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Ticket #{selectedTicket?.id} — {selectedTicket?.subject}</Modal.Title>
        </Modal.Header>
        {selectedTicket && (
          <Modal.Body>
            <div className="d-flex gap-2 mb-3">
              {getStatusBadge(selectedTicket.status)}
              {getPriorityBadge(selectedTicket.priority)}
              <Badge bg="secondary">{selectedTicket.first_name} {selectedTicket.last_name}</Badge>
              <small className="text-muted ms-auto">{formatDateTime(selectedTicket.created_at)}</small>
            </div>

            {/* Original user message */}
            <Card className="mb-3 bg-light">
              <Card.Body>
                <strong className="d-block mb-2 text-secondary" style={{ fontSize: '0.8rem' }}>USER'S ORIGINAL MESSAGE:</strong>
                <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{selectedTicket.message}</p>
              </Card.Body>
            </Card>

            {/* Previous admin response (if any) */}
            {selectedTicket.admin_response && (
              <Card className="mb-3 border-primary">
                <Card.Body>
                  <strong className="d-block mb-2 text-primary" style={{ fontSize: '0.8rem' }}>PREVIOUS ADMIN RESPONSE:</strong>
                  <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{selectedTicket.admin_response}</p>
                  {selectedTicket.admin_first_name && (
                    <small className="text-muted">— {selectedTicket.admin_first_name} {selectedTicket.admin_last_name}</small>
                  )}
                </Card.Body>
              </Card>
            )}

            {/* User reply — highlighted in amber so admin clearly sees it */}
            {selectedTicket.user_reply && (
              <Card className="mb-3 border-warning">
                <Card.Body>
                  <strong className="d-block mb-2 text-warning" style={{ fontSize: '0.8rem' }}>
                    USER REPLY — {formatDateTime(selectedTicket.user_replied_at)}:
                  </strong>
                  <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{selectedTicket.user_reply}</p>
                </Card.Body>
              </Card>
            )}

            {respondError && <Alert variant="danger">{respondError}</Alert>}

            {/* Admin response form */}
            <Form.Group className="mb-3">
              <Form.Label>
                <strong>{selectedTicket.admin_response ? 'Follow-up Response' : 'Response'}</strong>
              </Form.Label>
              <Form.Control as="textarea" rows={5} value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Type your response to the user..." />
              <Form.Text className="text-muted">The user will receive an email with your response.</Form.Text>
            </Form.Group>

            <Form.Group>
              <Form.Label><strong>Update Status</strong></Form.Label>
              <Form.Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
        )}
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDetailModal(false)} disabled={respondLoading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleRespond} disabled={respondLoading}>
            {respondLoading
              ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Saving...</>
              : 'Save Response'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Create Test Ticket Modal */}
      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)} centered>
        <Modal.Header closeButton><Modal.Title>Create Test Ticket</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="info">Creates a support ticket on behalf of a user for testing and demo purposes.</Alert>
          {createError && <Alert variant="danger">{createError}</Alert>}
          <Form.Group className="mb-3">
            <Form.Label>User ID <span className="text-danger">*</span></Form.Label>
            <Form.Control type="number" value={createForm.userId}
              onChange={(e) => setCreateForm(p => ({ ...p, userId: e.target.value }))}
              placeholder="Enter the target user's ID" />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Subject <span className="text-danger">*</span></Form.Label>
            <Form.Control type="text" value={createForm.subject}
              onChange={(e) => setCreateForm(p => ({ ...p, subject: e.target.value }))}
              placeholder="Ticket subject" maxLength={200} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Message <span className="text-danger">*</span></Form.Label>
            <Form.Control as="textarea" rows={4} value={createForm.message}
              onChange={(e) => setCreateForm(p => ({ ...p, message: e.target.value }))}
              placeholder="Describe the issue..." />
          </Form.Group>
          <Form.Group>
            <Form.Label>Priority</Form.Label>
            <Form.Select value={createForm.priority}
              onChange={(e) => setCreateForm(p => ({ ...p, priority: e.target.value }))}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)} disabled={createLoading}>Cancel</Button>
          <Button variant="primary" onClick={handleCreateTicket} disabled={createLoading}>
            {createLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Creating...</> : 'Create Ticket'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default AdminSupportTickets;