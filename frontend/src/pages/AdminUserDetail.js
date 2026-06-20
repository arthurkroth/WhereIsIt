/**
 * File: AdminUserDetail.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Full admin detail page for a single user.
 * Shows account overview, activity summary, MFA status,
 * recent login history, and account action history.
 *
 * Account actions available (all require a written reason):
 * - Change Tier (FREE <> PREMIUM)
 * - Suspend Account (min 20 char reason)
 * - Reactivate Account
 * - Reset Password (triggers email to user)
 * - Reset MFA (requires 50 char justification + admin password re-entry)
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Row, Col, Card, Badge, Button,
  Alert, Spinner, Modal, Form, Table
} from 'react-bootstrap';
import {
  getAdminUser,
  adminChangeTier,
  adminSuspendAccount,
  adminReactivateAccount,
  adminResetPassword,
  adminResetMfa
} from '../services/api';
import { formatDate, formatDateTime } from '../utils/format';

// Full admin detail/management view for a single user account.
function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Modal visibility state
  const [showTierModal, setShowTierModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showResetMfaModal, setShowResetMfaModal] = useState(false);

  // Form state for each modal
  const [tierForm, setTierForm] = useState({ newTier: 'FREE', reason: '' });
  const [suspendForm, setSuspendForm] = useState({ reason: '' });
  const [reactivateForm, setReactivateForm] = useState({ reason: '' });
  const [resetPwForm, setResetPwForm] = useState({ reason: '' });
  const [resetMfaForm, setResetMfaForm] = useState({ justification: '', adminPassword: '' });

  // Action loading states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Reloads the user whenever the route's :id param changes.
  useEffect(() => { fetchUser(); }, [id]);

  // Fetches the full detail record for this user.
  const fetchUser = async () => {
    setLoading(true); setError('');
    try {
      const response = await getAdminUser(id);
      setUser(response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  // Clears form state and errors for every action modal.
  const resetModalState = () => {
    setActionError('');
    setTierForm({ newTier: 'FREE', reason: '' });
    setSuspendForm({ reason: '' });
    setReactivateForm({ reason: '' });
    setResetPwForm({ reason: '' });
    setResetMfaForm({ justification: '', adminPassword: '' });
  };

  // Closes every action modal and resets their form state.
  const handleCloseAll = () => {
    setShowTierModal(false); setShowSuspendModal(false);
    setShowReactivateModal(false); setShowResetPasswordModal(false);
    setShowResetMfaModal(false);
    resetModalState();
  };

  // Shows a success banner, closes the active modal, and refreshes the user record.
  const showSuccess = (msg) => {
    setActionSuccess(msg);
    handleCloseAll();
    fetchUser(); // Refresh user data
    setTimeout(() => setActionSuccess(''), 8000);
  };

  // ────────────────────── Action handlers ───────────────────────────────────

  // Changes the user's FREE/PREMIUM tier after validating the reason.
  const handleChangeTier = async () => {
    if (tierForm.reason.trim().length < 10) {
      setActionError('Reason must be at least 10 characters'); return;
    }
    setActionLoading(true); setActionError('');
    try {
      await adminChangeTier(id, tierForm.newTier, tierForm.reason);
      showSuccess(`User tier changed to ${tierForm.newTier} successfully`);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to change tier');
    } finally { setActionLoading(false); }
  };

  // Suspends the account after validating the reason length.
  const handleSuspend = async () => {
    if (suspendForm.reason.trim().length < 20) {
      setActionError('Suspension reason must be at least 20 characters'); return;
    }
    setActionLoading(true); setActionError('');
    try {
      await adminSuspendAccount(id, suspendForm.reason);
      showSuccess('Account suspended successfully');
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to suspend account');
    } finally { setActionLoading(false); }
  };

  // Reactivates a suspended account after validating the reason length.
  const handleReactivate = async () => {
    if (reactivateForm.reason.trim().length < 10) {
      setActionError('Reason must be at least 10 characters'); return;
    }
    setActionLoading(true); setActionError('');
    try {
      await adminReactivateAccount(id, reactivateForm.reason);
      showSuccess('Account reactivated successfully');
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to reactivate account');
    } finally { setActionLoading(false); }
  };

  // Triggers a password reset email after validating the reason length.
  const handleResetPassword = async () => {
    if (resetPwForm.reason.trim().length < 10) {
      setActionError('Reason must be at least 10 characters'); return;
    }
    setActionLoading(true); setActionError('');
    try {
      await adminResetPassword(id, resetPwForm.reason);
      showSuccess('Password reset email sent to user');
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to send reset email');
    } finally { setActionLoading(false); }
  };

  // Resets the user's MFA after validating the justification and re-entered admin password.
  const handleResetMfa = async () => {
    if (resetMfaForm.justification.trim().length < 50) {
      setActionError('Justification must be at least 50 characters'); return;
    }
    if (!resetMfaForm.adminPassword) {
      setActionError('Your password is required'); return;
    }
    setActionLoading(true); setActionError('');
    try {
      await adminResetMfa(id, resetMfaForm.justification, resetMfaForm.adminPassword);
      showSuccess('MFA reset successfully. User has been notified.');
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to reset MFA');
    } finally { setActionLoading(false); }
  };

  // ────────────────────────── Helpers ───────────────────────────────────────

  // Maps an audit log action to a Bootstrap badge colour.
  const getActionBadgeVariant = (action) => {
    if (action?.includes('LOGIN')) return 'success';
    if (action?.includes('MFA')) return 'warning';
    if (action?.includes('ADMIN')) return 'danger';
    if (action?.includes('RECEIPT')) return 'primary';
    return 'secondary';
  };

  // ─────────────────────────────── Render ───────────────────────────────────

  if (loading) return (
    <Container className="mt-0 text-center py-5">
      <Spinner animation="border" variant="primary" />
      <p className="mt-3 text-muted">Loading user details...</p>
    </Container>
  );

  if (error) return (
    <Container className="mt-0">
      <Button variant="outline-secondary" className="mb-3" onClick={() => navigate('/admin/users')}>← Back</Button>
      <Alert variant="danger">{error}</Alert>
    </Container>
  );

  if (!user) return null;

  const isSuspended = user.status === 'suspended';

  return (
    <Container className="mt-0">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <Button variant="outline-secondary" size="sm" className="me-3"
            onClick={() => navigate('/admin/users')}>← Users</Button>
          <strong className="fs-4">{user.firstName} {user.lastName}</strong>
          <span className="ms-2 text-muted">#{user.id}</span>
        </div>
        <div className="d-flex gap-2">
          {isSuspended
            ? <Badge bg="danger" className="fs-6 py-2 px-3">Suspended</Badge>
            : <Badge bg="success" className="fs-6 py-2 px-3">Active</Badge>}
          {user.role === 'PREMIUM' && <Badge bg="warning" text="dark" className="fs-6 py-2 px-3">★ Premium</Badge>}
          {user.role === 'ADMIN' && <Badge bg="danger" className="fs-6 py-2 px-3">Admin</Badge>}
        </div>
      </div>

      {actionSuccess && (
        <Alert variant="success" dismissible onClose={() => setActionSuccess('')}>
          {actionSuccess}
        </Alert>
      )}

      <Row className="g-3 mb-3">
        {/* Account overview */}
        <Col md={6}>
          <Card className="h-100">
            <Card.Header className="bg-primary text-white"><strong>Account Overview</strong></Card.Header>
            <Card.Body>
              <table className="table table-sm mb-0">
                <tbody>
                  <tr><td className="text-muted">Email</td><td>{user.email}</td></tr>
                  <tr><td className="text-muted">Role</td><td>{user.role}</td></tr>
                  <tr><td className="text-muted">Status</td>
                    <td>{isSuspended ? <span className="text-danger">Suspended</span> : <span className="text-success">Active</span>}</td></tr>
                  <tr><td className="text-muted">Email verified</td>
                    <td>{user.emailVerified ? '✓ Yes' : '✗ No'}</td></tr>
                  <tr><td className="text-muted">MFA</td>
                    <td>{user.mfaEnabled
                      ? <><Badge bg="success">Enabled</Badge><small className="text-muted ms-2">({user.remainingRecoveryCodes} recovery codes)</small></>
                      : <Badge bg="warning" text="dark">Disabled</Badge>}</td></tr>
                  <tr><td className="text-muted">Registered</td><td>{formatDate(user.createdAt)}</td></tr>
                  <tr><td className="text-muted">Receipts</td><td>{user.receiptCount}</td></tr>
                </tbody>
              </table>
            </Card.Body>
          </Card>
        </Col>

        {/* Account actions */}
        <Col md={6}>
          <Card className="h-100">
            <Card.Header className="bg-dark text-white"><strong>Account Actions</strong></Card.Header>
            <Card.Body>
              <div className="d-grid gap-2">
                {/* Change Tier — not for admins */}
                {user.role !== 'ADMIN' && (
                  <Button variant="outline-warning"
                    onClick={() => { resetModalState(); setTierForm({ newTier: user.role === 'FREE' ? 'PREMIUM' : 'FREE', reason: '' }); setShowTierModal(true); }}>
                    ↕ Change Tier (currently {user.role})
                  </Button>
                )}

                {/* Suspend / Reactivate */}
                {user.role !== 'ADMIN' && !isSuspended && (
                  <Button variant="outline-danger"
                    onClick={() => { resetModalState(); setShowSuspendModal(true); }}>
                    🚫 Suspend Account
                  </Button>
                )}
                {isSuspended && (
                  <Button variant="outline-success"
                    onClick={() => { resetModalState(); setShowReactivateModal(true); }}>
                    ✓ Reactivate Account
                  </Button>
                )}

                {/* Reset Password */}
                <Button variant="outline-secondary"
                  onClick={() => { resetModalState(); setShowResetPasswordModal(true); }}>
                  🔑 Send Password Reset Email
                </Button>

                {/* Reset MFA — only if MFA is enabled */}
                {user.mfaEnabled && (
                  <Button variant="outline-danger"
                    onClick={() => { resetModalState(); setShowResetMfaModal(true); }}>
                    🔐 Reset MFA (requires password)
                  </Button>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-3">
        {/* Recent logins */}
        <Col md={6}>
          <Card>
            <Card.Header><strong>Recent Login History</strong></Card.Header>
            <Card.Body className="p-0">
              {user.recentLogins.length === 0 ? (
                <div className="text-center py-3 text-muted"><small>No login history</small></div>
              ) : (
                <Table size="sm" className="mb-0">
                  <thead className="table-light">
                    <tr><th>Action</th><th>IP</th><th>Time</th></tr>
                  </thead>
                  <tbody>
                    {user.recentLogins.map((login, i) => (
                      <tr key={i}>
                        <td><Badge bg={login.action === 'LOGIN_SUCCESS' ? 'success' : 'danger'} style={{ fontSize: '0.65rem' }}>
                          {login.action === 'LOGIN_SUCCESS' ? 'Success' : 'Failed'}</Badge></td>
                        <td><small className="text-muted font-monospace">{login.ip_address || '—'}</small></td>
                        <td><small className="text-muted">{formatDateTime(login.created_at)}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Account action history */}
        <Col md={6}>
          <Card>
            <Card.Header><strong>Account Action History</strong></Card.Header>
            <Card.Body className="p-0">
              {user.actionHistory.length === 0 ? (
                <div className="text-center py-3 text-muted"><small>No history recorded</small></div>
              ) : (
                <Table size="sm" className="mb-0">
                  <thead className="table-light">
                    <tr><th>Action</th><th>Details</th><th>Time</th></tr>
                  </thead>
                  <tbody>
                    {user.actionHistory.map((entry, i) => (
                      <tr key={i}>
                        <td><Badge bg={getActionBadgeVariant(entry.action)} style={{ fontSize: '0.65rem' }}>
                          {entry.action?.replace(/_/g, ' ')}</Badge></td>
                        <td><small className="text-muted">
                          {entry.details?.substring(0, 50)}{entry.details?.length > 50 ? '…' : ''}
                        </small></td>
                        <td><small className="text-muted">{formatDateTime(entry.created_at)}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* ────────────────────────── MODALS ─────────────────────────────────── */}

      {/* Change Tier Modal */}
      <Modal show={showTierModal} onHide={handleCloseAll} centered>
        <Modal.Header closeButton><Modal.Title>Change Account Tier</Modal.Title></Modal.Header>
        <Modal.Body>
          {actionError && <Alert variant="danger">{actionError}</Alert>}
          <Form.Group className="mb-3">
            <Form.Label>New Tier</Form.Label>
            <Form.Select value={tierForm.newTier}
              onChange={(e) => setTierForm(p => ({ ...p, newTier: e.target.value }))}>
              <option value="FREE">FREE</option>
              <option value="PREMIUM">PREMIUM</option>
            </Form.Select>
          </Form.Group>
          <Form.Group>
            <Form.Label>Reason <span className="text-danger">*</span> <small className="text-muted">(min 10 characters)</small></Form.Label>
            <Form.Control as="textarea" rows={3} value={tierForm.reason}
              onChange={(e) => setTierForm(p => ({ ...p, reason: e.target.value }))}
              placeholder="Why is this tier change being made?" />
            <Form.Text className="text-muted">{tierForm.reason.length}/10 minimum</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseAll} disabled={actionLoading}>Cancel</Button>
          <Button variant="warning" onClick={handleChangeTier} disabled={actionLoading}>
            {actionLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Saving...</> : 'Change Tier'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Suspend Modal */}
      <Modal show={showSuspendModal} onHide={handleCloseAll} centered>
        <Modal.Header closeButton className="bg-danger text-white"><Modal.Title>Suspend Account</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="warning">This will prevent the user from logging in. They will receive a notification email.</Alert>
          {actionError && <Alert variant="danger">{actionError}</Alert>}
          <Form.Group>
            <Form.Label>Reason for suspension <span className="text-danger">*</span> <small className="text-muted">(min 20 characters)</small></Form.Label>
            <Form.Control as="textarea" rows={4} value={suspendForm.reason}
              onChange={(e) => setSuspendForm({ reason: e.target.value })}
              placeholder="Explain why this account is being suspended..." />
            <Form.Text className={`${suspendForm.reason.length >= 20 ? 'text-success' : 'text-muted'}`}>
              {suspendForm.reason.length}/20 minimum
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseAll} disabled={actionLoading}>Cancel</Button>
          <Button variant="danger" onClick={handleSuspend} disabled={actionLoading}>
            {actionLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Suspending...</> : 'Suspend Account'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Reactivate Modal */}
      <Modal show={showReactivateModal} onHide={handleCloseAll} centered>
        <Modal.Header closeButton className="bg-success text-white"><Modal.Title>Reactivate Account</Modal.Title></Modal.Header>
        <Modal.Body>
          {actionError && <Alert variant="danger">{actionError}</Alert>}
          <Form.Group>
            <Form.Label>Reason for reactivation <span className="text-danger">*</span> <small className="text-muted">(min 10 characters)</small></Form.Label>
            <Form.Control as="textarea" rows={3} value={reactivateForm.reason}
              onChange={(e) => setReactivateForm({ reason: e.target.value })}
              placeholder="Why is this account being reactivated?" />
            <Form.Text className="text-muted">{reactivateForm.reason.length}/10 minimum</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseAll} disabled={actionLoading}>Cancel</Button>
          <Button variant="success" onClick={handleReactivate} disabled={actionLoading}>
            {actionLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Reactivating...</> : 'Reactivate Account'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Reset Password Modal */}
      <Modal show={showResetPasswordModal} onHide={handleCloseAll} centered>
        <Modal.Header closeButton><Modal.Title>Send Password Reset</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="info">A password reset link will be emailed to <strong>{user.email}</strong>. The link expires in 24 hours.</Alert>
          {actionError && <Alert variant="danger">{actionError}</Alert>}
          <Form.Group>
            <Form.Label>Reason <span className="text-danger">*</span> <small className="text-muted">(min 10 characters)</small></Form.Label>
            <Form.Control as="textarea" rows={3} value={resetPwForm.reason}
              onChange={(e) => setResetPwForm({ reason: e.target.value })}
              placeholder="Why is a password reset being triggered?" />
            <Form.Text className="text-muted">{resetPwForm.reason.length}/10 minimum</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseAll} disabled={actionLoading}>Cancel</Button>
          <Button variant="primary" onClick={handleResetPassword} disabled={actionLoading}>
            {actionLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Sending...</> : 'Send Reset Email'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Reset MFA Modal — most sensitive action */}
      <Modal show={showResetMfaModal} onHide={handleCloseAll} centered>
        <Modal.Header closeButton className="bg-danger text-white"><Modal.Title>⚠ Reset MFA</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="danger">
            <strong>This is a high-security action.</strong> Resetting MFA will disable two-factor
            authentication and invalidate all recovery codes. The user will receive an urgent security
            notification email.
          </Alert>
          {actionError && <Alert variant="warning">{actionError}</Alert>}
          <Form.Group className="mb-3">
            <Form.Label>Justification <span className="text-danger">*</span> <small className="text-muted">(min 50 characters)</small></Form.Label>
            <Form.Control as="textarea" rows={4} value={resetMfaForm.justification}
              onChange={(e) => setResetMfaForm(p => ({ ...p, justification: e.target.value }))}
              placeholder="Provide a detailed justification for this MFA reset..." />
            <Form.Text className={`${resetMfaForm.justification.length >= 50 ? 'text-success' : 'text-muted'}`}>
              {resetMfaForm.justification.length}/50 minimum
            </Form.Text>
          </Form.Group>
          <Form.Group>
            <Form.Label>Your (admin) password <span className="text-danger">*</span></Form.Label>
            <Form.Control type="password" value={resetMfaForm.adminPassword}
              onChange={(e) => setResetMfaForm(p => ({ ...p, adminPassword: e.target.value }))}
              placeholder="Re-enter your password to confirm" autoComplete="current-password" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseAll} disabled={actionLoading}>Cancel</Button>
          <Button variant="danger" onClick={handleResetMfa} disabled={actionLoading}>
            {actionLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Resetting...</> : 'Reset MFA'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default AdminUserDetail;