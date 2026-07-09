/**
 * File: Profile.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Profile page with five tabs:
 * 1. Account Details   — name and email management
 * 2. Change Password   — password change
 * 3. Security (MFA)    — enable/disable MFA, recovery codes
 * 4. Premium Settings  — warranty alert preferences (PREMIUM only)
 * 5. Contact Support   — submit tickets, view history, reply to admin responses
 */

import React, { useState, useEffect } from 'react';
import {
  Container, Row, Col, Card, Form, Button,
  Alert, Spinner, Tab, Nav, Badge, Modal
} from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import {
  getProfile, updateProfile, changeEmail, changePassword,
  beginMfaSetup, confirmMfaSetup, disableMfa,
  getPremiumSettings, updatePremiumSettings, sendTestAlert,
  createSupportTicket, getUserTickets, replyToSupportTicket,
  deleteAccount
} from '../services/api';
import { formatDate } from '../utils/format';

// Profile page with tabs for account details, password, MFA, Premium settings, and support.
function Profile() {
  const { user, logoutUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState('');

  // Tab 1
  const [nameForm, setNameForm] = useState({ firstName: '', lastName: '' });
  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPasswordForEmail: '' });
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [nameSuccess, setNameSuccess] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailError, setEmailError] = useState('');

  // Tab 2
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Tab 3: MFA
  const [mfaStep, setMfaStep] = useState('idle');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [showSecretText, setShowSecretText] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Tab 4: Premium
  const [premiumSettings, setPremiumSettings] = useState(null);
  const [loadingPremium, setLoadingPremium] = useState(false);
  const [savingPremium, setSavingPremium] = useState(false);
  const [premiumSuccess, setPremiumSuccess] = useState('');
  const [premiumError, setPremiumError] = useState('');
  const [testAlertLoading, setTestAlertLoading] = useState(false);
  const [testAlertMsg, setTestAlertMsg] = useState('');

  // Tab 5: Support
  const [supportForm, setSupportForm] = useState({ subject: '', message: '', priority: 'medium' });
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState('');
  const [supportError, setSupportError] = useState('');
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  // Per-ticket reply state: { [ticketId]: { text, loading, error, success } }
  const [replyState, setReplyState] = useState({});

  // Account deletion
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isPremium = profile?.role === 'PREMIUM' || user?.role === 'PREMIUM';
  const isFree = (profile?.role === 'FREE' || user?.role === 'FREE') && user?.role !== 'ADMIN';

  // Controls which tab is active — needs to be state so the Upgrade tab can
  // navigate the user directly to Contact Support after clicking "I've paid".
  const [activeTab, setActiveTab] = useState('details');
  const [selectedPlan, setSelectedPlan] = useState(null);

  // Loads the user's profile on mount.
  useEffect(() => { fetchProfile(); }, []);

  // Fetches the current user's profile and seeds the account-details form.
  const fetchProfile = async () => {
    setLoadingProfile(true); setProfileLoadError('');
    try {
      const response = await getProfile();
      const data = response.data.profile;
      setProfile(data);
      setNameForm({ firstName: data.firstName || '', lastName: data.lastName || '' });
      setEmailForm(prev => ({ ...prev, newEmail: data.email || '' }));
    } catch {
      setProfileLoadError('Failed to load profile. Please refresh the page.');
    } finally {
      setLoadingProfile(false);
    }
  };

  // Fetches the Premium user's warranty alert preferences.
  const fetchPremiumSettings = async () => {
    setLoadingPremium(true);
    try {
      const response = await getPremiumSettings();
      setPremiumSettings(response.data.settings);
    } catch (err) {
      setPremiumError(err.response?.data?.error || 'Failed to load premium settings');
    } finally {
      setLoadingPremium(false);
    }
  };

  // Fetches the user's own support ticket history.
  const fetchTickets = async () => {
    setLoadingTickets(true);
    try {
      const response = await getUserTickets();
      setTickets(response.data.tickets || []);
    } catch {} finally {
      setLoadingTickets(false);
    }
  };

  // Pulls the raw TOTP secret out of an otpauth:// URL for manual entry.
  const extractSecret = (url) => {
    try { return new URL(url).searchParams.get('secret') || null; } catch { return null; }
  };

  // ── Tab 1 ──────────────────────────────────────────────────────────────────
  // Saves the user's first/last name.
  const handleSaveName = async (e) => {
    e.preventDefault();
    setNameSuccess(''); setNameError('');
    if (!nameForm.firstName.trim() || !nameForm.lastName.trim()) { setNameError('Both names are required'); return; }
    setSavingName(true);
    try {
      await updateProfile(nameForm.firstName.trim(), nameForm.lastName.trim());
      setNameSuccess('Name updated successfully');
      await fetchProfile();
    } catch (err) { setNameError(err.response?.data?.error || 'Failed to update name'); }
    finally { setSavingName(false); }
  };

  // Changes the user's email address after verifying their current password.
  const handleChangeEmail = async (e) => {
    e.preventDefault();
    setEmailSuccess(''); setEmailError('');
    if (!emailForm.newEmail.trim()) { setEmailError('New email is required'); return; }
    if (!emailForm.currentPasswordForEmail) { setEmailError('Current password is required'); return; }
    setSavingEmail(true);
    try {
      await changeEmail(emailForm.newEmail.trim(), emailForm.currentPasswordForEmail);
      setEmailSuccess('Email updated. Please verify your new address.');
      setEmailForm(prev => ({ ...prev, currentPasswordForEmail: '' }));
      await fetchProfile();
    } catch (err) { setEmailError(err.response?.data?.error || 'Failed to update email'); }
    finally { setSavingEmail(false); }
  };

  // ── Tab 2 ──────────────────────────────────────────────────────────────────
  // Validates and submits a password change request.
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordSuccess(''); setPasswordError('');
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('All fields are required'); return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { setPasswordError('Passwords do not match'); return; }
    if (passwordForm.newPassword.length < 12) { setPasswordError('Min 12 characters required'); return; }
    if (passwordForm.newPassword === passwordForm.currentPassword) { setPasswordError('Must differ from current password'); return; }
    setSavingPassword(true);
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword, passwordForm.confirmPassword);
      setPasswordSuccess('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) { setPasswordError(err.response?.data?.error || 'Failed to change password'); }
    finally { setSavingPassword(false); }
  };

  // ── Tab 3: MFA ─────────────────────────────────────────────────────────────
  // Requests a new otpauth URL/QR code to start MFA setup.
  const handleBeginMfa = async () => {
    setMfaError(''); setMfaSuccess(''); setMfaLoading(true); setShowSecretText(false);
    try {
      const response = await beginMfaSetup();
      setOtpauthUrl(response.data.otpauthUrl);
      setMfaStep('qr');
    } catch { setMfaError('Failed to start MFA setup.'); }
    finally { setMfaLoading(false); }
  };

  // Verifies the first TOTP code and enables MFA, showing recovery codes on success.
  const handleConfirmMfa = async (e) => {
    e.preventDefault();
    if (!mfaToken || mfaToken.length < 6) { setMfaError('Enter a valid 6-digit code'); return; }
    setMfaLoading(true); setMfaError('');
    try {
      const response = await confirmMfaSetup(mfaToken);
      if (response.data.success) {
        setRecoveryCodes(response.data.recoveryCodes || []);
        setShowRecoveryModal(true);
        setMfaStep('complete'); setMfaToken('');
        await fetchProfile();
      } else { setMfaError('Invalid code. Try again.'); }
    } catch { setMfaError('Failed to verify code.'); }
    finally { setMfaLoading(false); }
  };

  // Disables MFA after the user confirms via a browser dialog.
  const handleDisableMfa = async () => {
    if (!window.confirm('Disable two-factor authentication? This will make your account less secure.')) return;
    setMfaLoading(true); setMfaError('');
    try {
      await disableMfa();
      setMfaSuccess('MFA disabled'); setMfaStep('idle');
      await fetchProfile();
    } catch { setMfaError('Failed to disable MFA.'); }
    finally { setMfaLoading(false); }
  };

  // Resets the MFA setup wizard back to its idle state.
  const handleResetMfaSetup = () => {
    setMfaStep('idle'); setOtpauthUrl(''); setMfaToken('');
    setMfaError(''); setMfaSuccess(''); setShowSecretText(false);
  };

  // Copies the recovery codes to the clipboard and shows a brief confirmation.
  const handleCopyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n')).then(() => {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    });
  };

  // ── Tab 4: Premium ─────────────────────────────────────────────────────────
  // Saves the Premium user's warranty alert preferences.
  const handleSavePremiumSettings = async (e) => {
    e.preventDefault();
    setPremiumSuccess(''); setPremiumError('');
    setSavingPremium(true);
    try {
      await updatePremiumSettings(
        premiumSettings.alertsEnabled,
        premiumSettings.alertTimeframeDays,
        premiumSettings.alertFrequency
      );
      setPremiumSuccess('Alert preferences saved successfully');
    } catch (err) { setPremiumError(err.response?.data?.error || 'Failed to save settings'); }
    finally { setSavingPremium(false); }
  };

  // Triggers a one-off test warranty alert email.
  const handleSendTestAlert = async () => {
    setTestAlertLoading(true); setTestAlertMsg('');
    try {
      const response = await sendTestAlert();
      setTestAlertMsg(response.data.message);
    } catch { setTestAlertMsg('Failed to send test alert.'); }
    finally { setTestAlertLoading(false); }
  };

  // ── Tab 5: Support ─────────────────────────────────────────────────────────
  // Validates and submits a new support ticket.
  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    setSupportSuccess(''); setSupportError('');
    if (!supportForm.subject.trim() || supportForm.subject.trim().length < 5) {
      setSupportError('Subject must be at least 5 characters'); return;
    }
    if (!supportForm.message.trim() || supportForm.message.trim().length < 10) {
      setSupportError('Message must be at least 10 characters'); return;
    }
    setSupportLoading(true);
    try {
      await createSupportTicket(supportForm.subject.trim(), supportForm.message.trim(), supportForm.priority);
      setSupportSuccess('Your support request has been submitted. We will respond within 24 hours.');
      setSupportForm({ subject: '', message: '', priority: 'medium' });
      fetchTickets();
    } catch (err) {
      setSupportError(err.response?.data?.error || 'Failed to submit ticket. Please try again.');
    } finally {
      setSupportLoading(false);
    }
  };

  /**
   * Updates the reply text for a specific ticket in the per-ticket state map.
   */
  const setReplyText = (ticketId, text) => {
    setReplyState(prev => ({ ...prev, [ticketId]: { ...prev[ticketId], text } }));
  };

  /**
   * Submits the user's reply to a specific ticket.
   * Sets status to in_progress and saves the reply text.
   */
  const handleSubmitReply = async (ticketId) => {
    const text = replyState[ticketId]?.text || '';
    if (text.trim().length < 5) {
      setReplyState(prev => ({ ...prev, [ticketId]: { ...prev[ticketId], error: 'Reply must be at least 5 characters' } }));
      return;
    }
    setReplyState(prev => ({ ...prev, [ticketId]: { ...prev[ticketId], loading: true, error: '', success: '' } }));
    try {
      await replyToSupportTicket(ticketId, text.trim());
      setReplyState(prev => ({
        ...prev,
        [ticketId]: { text: '', loading: false, error: '', success: 'Reply submitted successfully.' }
      }));
      fetchTickets(); // Refresh to show the saved reply
    } catch (err) {
      setReplyState(prev => ({
        ...prev,
        [ticketId]: {
          ...prev[ticketId],
          loading: false,
          error: err.response?.data?.error || 'Failed to submit reply'
        }
      }));
    }
  };

  // Permanently deletes the account after password confirmation.
  const handleDeleteAccount = async () => {
    if (!deletePassword) { setDeleteError('Please enter your password to confirm.'); return; }
    setDeleteLoading(true); setDeleteError('');
    try {
      await deleteAccount(deletePassword);
      logoutUser();
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account. Please try again.');
      setDeleteLoading(false);
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

  if (loadingProfile) return (
    <Container className="mt-0 text-center py-5">
      <Spinner animation="border" variant="primary" />
      <p className="mt-3 text-muted">Loading your profile...</p>
    </Container>
  );

  if (profileLoadError) return (
    <Container className="mt-0"><Alert variant="danger">{profileLoadError}</Alert></Container>
  );

  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">My Profile</h2>
        <div>
          <Badge bg={isPremium ? 'warning' : 'secondary'} text={isPremium ? 'dark' : 'white'} className="me-2">
            {profile?.role}
          </Badge>
          <small className="text-muted">
            Member since {profile?.createdAt
              ? new Date(profile.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })
              : 'N/A'}
          </small>
        </div>
      </div>

      <Tab.Container activeKey={activeTab} onSelect={k => setActiveTab(k)}>
        <Nav variant="tabs" className="mb-4">
          <Nav.Item><Nav.Link eventKey="details">Account Details</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="password">Change Password</Nav.Link></Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="security">
              Security (MFA)
              {profile?.mfaEnabled
                ? <Badge bg="success" className="ms-2">Enabled</Badge>
                : <Badge bg="warning" text="dark" className="ms-2">Disabled</Badge>}
            </Nav.Link>
          </Nav.Item>
          {isPremium && (
            <Nav.Item>
              <Nav.Link eventKey="premium" onClick={() => !premiumSettings && fetchPremiumSettings()}>
                <span className="text-warning">★</span> Premium Settings
              </Nav.Link>
            </Nav.Item>
          )}
          {isFree && (
            <Nav.Item>
              <Nav.Link eventKey="upgrade">
                <span className="text-success">★</span> Upgrade to Premium
              </Nav.Link>
            </Nav.Item>
          )}
          <Nav.Item>
            <Nav.Link eventKey="support" onClick={() => tickets.length === 0 && fetchTickets()}>
              Contact Support
            </Nav.Link>
          </Nav.Item>
        </Nav>

        <Tab.Content>

          {/* ── Tab 1: Account Details ──────────────────────────────────── */}
          <Tab.Pane eventKey="details">
            <Row>
              <Col md={6} className="mb-4">
                <Card>
                  <Card.Header className="bg-primary text-white"><strong>Personal Information</strong></Card.Header>
                  <Card.Body>
                    {nameSuccess && <Alert variant="success" dismissible onClose={() => setNameSuccess('')}>{nameSuccess}</Alert>}
                    {nameError && <Alert variant="danger" dismissible onClose={() => setNameError('')}>{nameError}</Alert>}
                    <Form noValidate onSubmit={handleSaveName}>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>First Name <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="text" value={nameForm.firstName}
                              onChange={(e) => setNameForm(p => ({ ...p, firstName: e.target.value }))} disabled={savingName} />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>Last Name <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="text" value={nameForm.lastName}
                              onChange={(e) => setNameForm(p => ({ ...p, lastName: e.target.value }))} disabled={savingName} />
                          </Form.Group>
                        </Col>
                      </Row>
                      <Button variant="primary" type="submit" disabled={savingName}>
                        {savingName ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Saving...</> : 'Save Name'}
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6} className="mb-4">
                <Card>
                  <Card.Header className="bg-primary text-white"><strong>Email Address</strong></Card.Header>
                  <Card.Body>
                    {emailSuccess && <Alert variant="success" dismissible onClose={() => setEmailSuccess('')}>{emailSuccess}</Alert>}
                    {emailError && <Alert variant="danger" dismissible onClose={() => setEmailError('')}>{emailError}</Alert>}
                    <Form.Group className="mb-3">
                      <Form.Label>Current Email</Form.Label>
                      <Form.Control type="email" value={profile?.email || ''} disabled className="bg-light" />
                    </Form.Group>
                    <Form noValidate onSubmit={handleChangeEmail}>
                      <Form.Group className="mb-3">
                        <Form.Label>New Email <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="email" value={emailForm.newEmail}
                          onChange={(e) => setEmailForm(p => ({ ...p, newEmail: e.target.value }))} disabled={savingEmail} />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Current Password <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="password" value={emailForm.currentPasswordForEmail}
                          onChange={(e) => setEmailForm(p => ({ ...p, currentPasswordForEmail: e.target.value }))} disabled={savingEmail} />
                      </Form.Group>
                      <Button variant="primary" type="submit" disabled={savingEmail}>
                        {savingEmail ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Saving...</> : 'Change Email'}
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* ── Danger zone: account deletion ───────────────────────── */}
            <Card className="border-danger mt-4">
              <Card.Header className="bg-danger text-white d-flex justify-content-between align-items-center">
                <strong>Danger Zone</strong>
              </Card.Header>
              <Card.Body>
                {!showDeleteConfirm ? (
                  <>
                    <p className="mb-2">Permanently delete your account and all associated data. <strong>This cannot be undone.</strong></p>
                    <Button variant="outline-danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                      Delete My Account
                    </Button>
                  </>
                ) : (
                  <>
                    <Alert variant="danger">
                      <strong>Are you absolutely sure?</strong>
                      <p className="mb-0 mt-1 small">
                        This will permanently delete your account, all your receipts, files, and data.
                        This action <strong>cannot be reversed</strong>.
                      </p>
                    </Alert>
                    {deleteError && <Alert variant="danger" dismissible onClose={() => setDeleteError('')}>{deleteError}</Alert>}
                    <Form.Group className="mb-3">
                      <Form.Label>Confirm your password</Form.Label>
                      <Form.Control
                        type="password"
                        placeholder="Enter your current password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        disabled={deleteLoading}
                        autoComplete="current-password"
                      />
                    </Form.Group>
                    <div className="d-flex gap-2">
                      <Button variant="danger" onClick={handleDeleteAccount} disabled={deleteLoading || !deletePassword}>
                        {deleteLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Deleting...</> : 'Yes, delete my account'}
                      </Button>
                      <Button variant="outline-secondary" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }} disabled={deleteLoading}>
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>

            {/* Premium subscription status — shown to PREMIUM users */}
            {isPremium && (
              <Card className="border-warning">
                <Card.Body className="d-flex align-items-center gap-3 py-2">
                  <span className="text-warning fs-4">★</span>
                  <div>
                    <strong>Premium subscription active</strong>
                    <div className="text-secondary small">
                      {profile?.premiumPermanent
                        ? 'Status: Permanent — no expiry'
                        : profile?.premiumExpiresAt
                          ? `Expires: ${formatDate(profile.premiumExpiresAt)}`
                          : 'No expiry date set'}
                    </div>
                  </div>
                </Card.Body>
              </Card>
            )}
          </Tab.Pane>

          {/* ── Tab 2: Change Password ──────────────────────────────────── */}
          <Tab.Pane eventKey="password">
            <Row className="justify-content-center">
              <Col md={6}>
                <Card>
                  <Card.Header className="bg-primary text-white"><strong>Change Password</strong></Card.Header>
                  <Card.Body>
                    {passwordSuccess && <Alert variant="success" dismissible onClose={() => setPasswordSuccess('')}>{passwordSuccess}</Alert>}
                    {passwordError && <Alert variant="danger" dismissible onClose={() => setPasswordError('')}>{passwordError}</Alert>}
                    <Form noValidate onSubmit={handleChangePassword}>
                      <Form.Group className="mb-3">
                        <Form.Label>Current Password <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="password" value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))}
                          disabled={savingPassword} autoComplete="current-password" />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>New Password <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="password" value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                          disabled={savingPassword} autoComplete="new-password" />
                        <Form.Text className="text-muted">Min 12 chars — uppercase, lowercase, number, special character.</Form.Text>
                      </Form.Group>
                      <Form.Group className="mb-4">
                        <Form.Label>Confirm New Password <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="password" value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                          disabled={savingPassword} autoComplete="new-password" />
                      </Form.Group>
                      <Button variant="primary" type="submit" disabled={savingPassword}>
                        {savingPassword ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Changing...</> : 'Change Password'}
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </Tab.Pane>

          {/* ── Tab 3: Security (MFA) ───────────────────────────────────── */}
          <Tab.Pane eventKey="security">
            <Row className="justify-content-center">
              <Col md={7}>
                {mfaError && <Alert variant="danger" dismissible onClose={() => setMfaError('')}>{mfaError}</Alert>}
                {mfaSuccess && <Alert variant="success" dismissible onClose={() => setMfaSuccess('')}>{mfaSuccess}</Alert>}
                {profile?.mfaEnabled && mfaStep === 'idle' && (
                  <Card className="border-success">
                    <Card.Header className="bg-success text-white d-flex justify-content-between">
                      <strong>Two-Factor Authentication</strong><Badge bg="light" text="dark">Active</Badge>
                    </Card.Header>
                    <Card.Body>
                      <p>Your account is protected with two-factor authentication.</p>
                      {profile?.remainingRecoveryCodes > 0 && (
                        <Alert variant="info">You have <strong>{profile.remainingRecoveryCodes}</strong> recovery code{profile.remainingRecoveryCodes !== 1 ? 's' : ''} remaining.</Alert>
                      )}
                      {profile?.remainingRecoveryCodes === 0 && (
                        <Alert variant="warning">No remaining recovery codes. Disable and re-enable MFA to generate new ones.</Alert>
                      )}
                      <Button variant="outline-danger" onClick={handleDisableMfa} disabled={mfaLoading}>
                        {mfaLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Disabling...</> : 'Disable MFA'}
                      </Button>
                    </Card.Body>
                  </Card>
                )}
                {!profile?.mfaEnabled && mfaStep === 'idle' && (
                  <Card>
                    <Card.Header className="bg-warning text-dark d-flex justify-content-between">
                      <strong>Two-Factor Authentication</strong><Badge bg="dark">Not Enabled</Badge>
                    </Card.Header>
                    <Card.Body>
                      <p>Add an extra layer of security with two-factor authentication.</p>
                      <Button variant="primary" onClick={handleBeginMfa} disabled={mfaLoading} className="mt-2">
                        {mfaLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Setting up...</> : 'Enable MFA'}
                      </Button>
                    </Card.Body>
                  </Card>
                )}
                {mfaStep === 'qr' && (
                  <Card>
                    <Card.Header className="bg-primary text-white"><strong>Scan QR Code</strong></Card.Header>
                    <Card.Body>
                      <Alert variant="warning"><strong>Keep this QR code secure.</strong> Do not share it with anyone.</Alert>
                      <div className="text-center mb-3">
                        {otpauthUrl && <div className="d-inline-block p-3 bg-white border rounded"><QRCodeSVG value={otpauthUrl} size={220} level="H" /></div>}
                      </div>
                      <div className="text-center mb-3">
                        <Button variant="link" size="sm" onClick={() => setShowSecretText(!showSecretText)}>
                          {showSecretText ? 'Hide secret key' : "Can't scan? Click to show secret key"}
                        </Button>
                      </div>
                      {showSecretText && extractSecret(otpauthUrl) && (
                        <Alert variant="secondary" className="text-center">
                          <small className="d-block mb-1 text-muted">Enter this key manually into your authenticator app:</small>
                          <code style={{ fontSize: '1.1rem', letterSpacing: '0.2em', wordBreak: 'break-all' }}>{extractSecret(otpauthUrl)}</code>
                        </Alert>
                      )}
                      <Form noValidate onSubmit={handleConfirmMfa}>
                        <Form.Group className="mb-3">
                          <Form.Label>Enter 6-digit Code <span className="text-danger">*</span></Form.Label>
                          <Form.Control type="text" placeholder="000000" value={mfaToken}
                            onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
                            maxLength={8} disabled={mfaLoading} autoFocus
                            style={{ fontSize: '1.5rem', letterSpacing: '0.5rem', textAlign: 'center' }} />
                        </Form.Group>
                        <div className="d-flex gap-2">
                          <Button variant="primary" type="submit" disabled={mfaLoading || mfaToken.length < 6}>
                            {mfaLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Verifying...</> : 'Verify and Enable'}
                          </Button>
                          <Button variant="outline-secondary" onClick={handleResetMfaSetup} disabled={mfaLoading}>Cancel</Button>
                        </div>
                      </Form>
                    </Card.Body>
                  </Card>
                )}
                {mfaStep === 'complete' && (
                  <Card className="border-success">
                    <Card.Body className="text-center">
                      <div className="text-success mb-3" style={{ fontSize: '4rem' }}>✓</div>
                      <h4 className="text-success mb-3">MFA Successfully Enabled!</h4>
                      {recoveryCodes.length > 0 && (
                        <Button variant="outline-primary" className="me-2" onClick={() => setShowRecoveryModal(true)}>View Recovery Codes</Button>
                      )}
                      <Button variant="outline-secondary" onClick={handleResetMfaSetup}>Set Up Another Device</Button>
                    </Card.Body>
                  </Card>
                )}
              </Col>
            </Row>
          </Tab.Pane>

          {/* ── Tab 4: Premium Settings ─────────────────────────────────── */}
          {isPremium && (
            <Tab.Pane eventKey="premium">
              <Row className="justify-content-center">
                <Col md={7}>
                  <Card className="border-warning">
                    <Card.Header className="bg-warning text-dark d-flex justify-content-between align-items-center">
                      <strong>★ Warranty Alert Preferences</strong>
                      <Badge bg="dark">Premium Feature</Badge>
                    </Card.Header>
                    <Card.Body>
                      {premiumSuccess && <Alert variant="success" dismissible onClose={() => setPremiumSuccess('')}>{premiumSuccess}</Alert>}
                      {premiumError && <Alert variant="danger" dismissible onClose={() => setPremiumError('')}>{premiumError}</Alert>}
                      {loadingPremium ? (
                        <div className="text-center py-3"><Spinner animation="border" variant="primary" /></div>
                      ) : !premiumSettings ? (
                        <div className="text-center"><Button variant="primary" onClick={fetchPremiumSettings}>Load Settings</Button></div>
                      ) : (
                        <Form noValidate onSubmit={handleSavePremiumSettings}>
                          <Form.Group className="mb-3">
                            <Form.Check type="switch" id="alertsEnabled" label="Enable warranty expiry email alerts"
                              checked={premiumSettings.alertsEnabled}
                              onChange={(e) => setPremiumSettings(p => ({ ...p, alertsEnabled: e.target.checked }))} />
                          </Form.Group>
                          <Form.Group className="mb-3">
                            <Form.Label>Alert me when a warranty expires within</Form.Label>
                            <Form.Select value={premiumSettings.alertTimeframeDays}
                              onChange={(e) => setPremiumSettings(p => ({ ...p, alertTimeframeDays: parseInt(e.target.value) }))}
                              disabled={!premiumSettings.alertsEnabled}>
                              <option value={7}>7 days</option>
                              <option value={14}>14 days</option>
                              <option value={30}>30 days</option>
                              <option value={60}>60 days</option>
                              <option value={90}>90 days</option>
                            </Form.Select>
                          </Form.Group>
                          <Form.Group className="mb-4">
                            <Form.Label>Email frequency</Form.Label>
                            <Form.Select value={premiumSettings.alertFrequency}
                              onChange={(e) => setPremiumSettings(p => ({ ...p, alertFrequency: e.target.value }))}
                              disabled={!premiumSettings.alertsEnabled}>
                              <option value="daily">Daily digest</option>
                              <option value="weekly">Weekly summary (Mondays)</option>
                              <option value="immediate">Immediate — one email per item</option>
                            </Form.Select>
                          </Form.Group>
                          {premiumSettings.lastAlertSent && (
                            <Alert variant="light" className="mb-3">
                              <small className="text-muted">Last alert sent: {new Date(premiumSettings.lastAlertSent).toLocaleString('en-GB')}</small>
                            </Alert>
                          )}
                          <div className="d-flex gap-2 flex-wrap">
                            <Button variant="warning" type="submit" disabled={savingPremium}>
                              {savingPremium ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Saving...</> : 'Save Preferences'}
                            </Button>
                            <Button variant="outline-secondary" onClick={handleSendTestAlert} disabled={testAlertLoading}>
                              {testAlertLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Sending...</> : 'Send Test Alert'}
                            </Button>
                          </div>
                          {testAlertMsg && (
                            <Alert variant="info" className="mt-3 mb-0">
                              {testAlertMsg}
                            </Alert>
                          )}
                        </Form>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Tab.Pane>
          )}

          {/* ── Upgrade to Premium tab (FREE users only) ───────────────── */}
          {isFree && (
            <Tab.Pane eventKey="upgrade">
              <Row className="justify-content-center">
                <Col md={10}>
                  <Alert variant="info" className="mb-4">
                    <strong>Academic Project Notice:</strong> WhereIsIt? is a final-year college project.
                    Premium subscriptions are managed manually. Payments are processed via Revolut —
                    no card details are stored by this application. The service may be discontinued
                    after the 2025/2026 academic year. Please review our{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>{' '}
                    before purchasing.
                  </Alert>

                  <h5 className="fw-bold mb-4 text-center">Choose your plan</h5>

                  <Row className="g-4 mb-4 justify-content-center">
                    {/* 1 Month plan */}
                    <Col md={5}>
                      <Card
                        className={`h-100 hover-card ${selectedPlan === '1month' ? 'border-primary' : ''}`}
                        onClick={() => setSelectedPlan('1month')}
                        style={{ cursor: 'pointer' }}
                      >
                        <Card.Body className="text-center py-4">
                          {selectedPlan === '1month' && <Badge bg="primary" className="mb-2">Selected</Badge>}
                          <h5 className="fw-bold mb-1">1 Month</h5>
                          <div className="display-6 fw-bold text-primary mb-1">€4.99</div>
                          <div className="text-muted small mb-3">€4.99 / month</div>
                          <ul className="list-unstyled text-start small">
                            <li className="mb-1">✓ Unlimited receipt storage</li>
                            <li className="mb-1">✓ AI-powered OCR (GPT-4o)</li>
                            <li className="mb-1">✓ Advanced receipt filters</li>
                            <li className="mb-1">✓ CSV export</li>
                            <li className="mb-1">✓ Warranty expiry email alerts</li>
                            <li>✓ Priority support</li>
                          </ul>
                        </Card.Body>
                      </Card>
                    </Col>

                    {/* 6 Month plan */}
                    <Col md={5}>
                      <Card
                        className={`h-100 hover-card ${selectedPlan === '6months' ? 'border-primary' : ''}`}
                        onClick={() => setSelectedPlan('6months')}
                        style={{ cursor: 'pointer', position: 'relative' }}
                      >
                        <Badge bg="success" style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '0.75rem', padding: '6px 12px' }}>
                          Best Value
                        </Badge>
                        <Card.Body className="text-center py-4">
                          {selectedPlan === '6months' && <Badge bg="primary" className="mb-2">Selected</Badge>}
                          <h5 className="fw-bold mb-1">6 Months</h5>
                          <div className="display-6 fw-bold text-primary mb-1">€24.99</div>
                          <div className="text-muted small mb-3">€4.16 / month — save 17%</div>
                          <ul className="list-unstyled text-start small">
                            <li className="mb-1">✓ Unlimited receipt storage</li>
                            <li className="mb-1">✓ AI-powered OCR (GPT-4o)</li>
                            <li className="mb-1">✓ Advanced receipt filters</li>
                            <li className="mb-1">✓ CSV export</li>
                            <li className="mb-1">✓ Warranty expiry email alerts</li>
                            <li>✓ Priority support</li>
                          </ul>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>

                  {/* Payment section — shown after plan selection */}
                  {selectedPlan && (
                    <Card className="mt-2">
                      <Card.Header className="bg-primary text-white">
                        <strong>Complete your payment via Revolut</strong>
                      </Card.Header>
                      <Card.Body>
                        <Alert variant="warning" className="mb-4">
                          <strong>Important:</strong> When making the payment, add your account email
                          address (<strong>{profile?.email}</strong>) in the payment description /
                          reference field so we can identify your payment.
                        </Alert>

                        <Row className="align-items-center g-4">
                          <Col md={4} className="text-center">
                            <QRCodeSVG value="https://revolut.me/arthurkroth" size={180} level="H" />
                            <div className="text-muted small mt-2">Scan with the Revolut app</div>
                          </Col>
                          <Col md={8}>
                            <p className="mb-2"><strong>Selected plan:</strong>{' '}
                              {selectedPlan === '1month' ? '1 Month — €4.99' : '6 Months — €24.99'}
                            </p>
                            <p className="mb-3">
                              <strong>Or pay via link:</strong>{' '}
                              <a href="https://revolut.me/arthurkroth" target="_blank" rel="noopener noreferrer">
                                revolut.me/arthurkroth
                              </a>
                            </p>
                            <p className="text-muted small mb-4">
                              Once you have completed the payment, click the button below to send
                              a confirmation to our support team. Your account will be upgraded
                              manually, typically within 24 hours.
                            </p>
                            <Button
                              variant="success"
                              onClick={() => {
                                const planLabel = selectedPlan === '1month' ? '1 Month' : '6 Months';
                                const planPrice = selectedPlan === '1month' ? '€4.99' : '€24.99';
                                setSupportForm({
                                  subject: `Premium Subscription Payment — ${planLabel} Plan`,
                                  message: `I have sent a payment of ${planPrice} via Revolut for the ${planLabel} Premium plan.\n\nMy account email: ${profile?.email}\n\nPlease activate my Premium subscription. Thank you.`,
                                  priority: 'medium'
                                });
                                setActiveTab('support');
                                if (tickets.length === 0) fetchTickets();
                              }}
                            >
                              I've sent the payment — notify support
                            </Button>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  )}
                </Col>
              </Row>
            </Tab.Pane>
          )}

          {/* ── Tab 5: Contact Support ──────────────────────────────────── */}
          <Tab.Pane eventKey="support">
            <Row>
              {/* Submit new ticket */}
              <Col md={6} className="mb-4">
                <Card>
                  <Card.Header className="bg-primary text-white"><strong>Submit a Support Request</strong></Card.Header>
                  <Card.Body>
                    {supportSuccess && <Alert variant="success" dismissible onClose={() => setSupportSuccess('')}>{supportSuccess}</Alert>}
                    {supportError && <Alert variant="danger" dismissible onClose={() => setSupportError('')}>{supportError}</Alert>}
                    <Form noValidate onSubmit={handleSubmitTicket}>
                      <Form.Group className="mb-3">
                        <Form.Label>Subject <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="text" value={supportForm.subject}
                          onChange={(e) => setSupportForm(p => ({ ...p, subject: e.target.value }))}
                          placeholder="Brief description of your issue"
                          maxLength={200} disabled={supportLoading} />
                        <Form.Text className="text-muted">{supportForm.subject.length}/200</Form.Text>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Priority</Form.Label>
                        <Form.Select value={supportForm.priority}
                          onChange={(e) => setSupportForm(p => ({ ...p, priority: e.target.value }))}
                          disabled={supportLoading}>
                          <option value="low">Low — general question or feedback</option>
                          <option value="medium">Medium — issue affecting normal use</option>
                          <option value="high">High — urgent, can't use the app</option>
                        </Form.Select>
                      </Form.Group>
                      <Form.Group className="mb-4">
                        <Form.Label>Message <span className="text-danger">*</span></Form.Label>
                        <Form.Control as="textarea" rows={5} value={supportForm.message}
                          onChange={(e) => setSupportForm(p => ({ ...p, message: e.target.value }))}
                          placeholder="Describe your issue in detail..." disabled={supportLoading} />
                      </Form.Group>
                      <Button variant="primary" type="submit" disabled={supportLoading}>
                        {supportLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Submitting...</> : 'Submit Request'}
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>

              {/* Ticket history with reply capability */}
              <Col md={6}>
                <Card>
                  <Card.Header className="d-flex justify-content-between align-items-center">
                    <strong>My Support Tickets</strong>
                    <Button variant="link" size="sm" onClick={fetchTickets} disabled={loadingTickets}>
                      {loadingTickets ? <Spinner as="span" animation="border" size="sm" /> : '↻ Refresh'}
                    </Button>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {loadingTickets ? (
                      <div className="text-center py-4"><Spinner animation="border" variant="primary" /></div>
                    ) : tickets.length === 0 ? (
                      <div className="text-center py-4 text-muted"><small>No support tickets yet.</small></div>
                    ) : (
                      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                        {tickets.map(ticket => {
                          const rs = replyState[ticket.id] || {};
                          const canReply = ticket.status !== 'resolved';
                          return (
                            <div key={ticket.id} className="p-3 border-bottom">
                              {/* Ticket header */}
                              <div className="d-flex justify-content-between align-items-start mb-1">
                                <strong style={{ fontSize: '0.9rem' }}>{ticket.subject}</strong>
                                <div className="d-flex gap-1 flex-shrink-0 ms-2">
                                  {getStatusBadge(ticket.status)}
                                  {getPriorityBadge(ticket.priority)}
                                </div>
                              </div>
                              <small className="text-muted d-block mb-2">Submitted {formatDate(ticket.created_at)}</small>

                              {/* Original message */}
                              <div className="p-2 bg-light rounded mb-2" style={{ fontSize: '0.85rem' }}>
                                <strong className="d-block mb-1 text-secondary" style={{ fontSize: '0.75rem' }}>Your message:</strong>
                                {ticket.message}
                              </div>

                              {/* Admin response */}
                              {ticket.admin_response && (
                                <div className="p-2 rounded border-start border-primary border-3 bg-white mb-2" style={{ fontSize: '0.85rem' }}>
                                  <strong className="d-block mb-1 text-primary" style={{ fontSize: '0.75rem' }}>Support response:</strong>
                                  {ticket.admin_response}
                                </div>
                              )}

                              {/* User's previous reply (if any) */}
                              {ticket.user_reply && (
                                <div className="p-2 rounded border-start border-secondary border-3 bg-light mb-2" style={{ fontSize: '0.85rem' }}>
                                  <strong className="d-block mb-1 text-secondary" style={{ fontSize: '0.75rem' }}>
                                    Your reply — {formatDate(ticket.user_replied_at)}:
                                  </strong>
                                  {ticket.user_reply}
                                </div>
                              )}

                              {/* Reply form — shown when ticket is not resolved */}
                              {canReply && ticket.admin_response && (
                                <div className="mt-2">
                                  {rs.success && (
                                    <Alert variant="success" className="py-1 px-2 mb-2" style={{ fontSize: '0.82rem' }}>
                                      {rs.success}
                                    </Alert>
                                  )}
                                  {rs.error && (
                                    <Alert variant="danger" className="py-1 px-2 mb-2" style={{ fontSize: '0.82rem' }}>
                                      {rs.error}
                                    </Alert>
                                  )}
                                  <Form.Control
                                    as="textarea"
                                    rows={2}
                                    placeholder="Reply to support..."
                                    value={rs.text || ''}
                                    onChange={(e) => setReplyText(ticket.id, e.target.value)}
                                    disabled={rs.loading}
                                    style={{ fontSize: '0.85rem' }}
                                    className="mb-2"
                                  />
                                  <Button
                                    variant="outline-primary"
                                    size="sm"
                                    onClick={() => handleSubmitReply(ticket.id)}
                                    disabled={rs.loading || !rs.text?.trim()}
                                  >
                                    {rs.loading
                                      ? <><Spinner as="span" animation="border" size="sm" className="me-1" />Sending...</>
                                      : 'Send Reply'}
                                  </Button>
                                </div>
                              )}

                              {/* Resolved notice */}
                              {ticket.status === 'resolved' && (
                                <div className="mt-2">
                                  <small className="text-success">✓ This ticket has been resolved.</small>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </Tab.Pane>

        </Tab.Content>
      </Tab.Container>

      {/* Recovery Codes Modal */}
      <Modal show={showRecoveryModal} onHide={() => setShowRecoveryModal(false)} size="md" centered>
        <Modal.Header closeButton><Modal.Title>Recovery Codes</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="warning"><strong>Save these codes now.</strong> Each can only be used once.</Alert>
          <div className="bg-light border rounded p-3 mb-3 font-monospace text-center">
            {recoveryCodes.map((code, i) => <div key={i} className="py-1" style={{ letterSpacing: '0.1em' }}>{code}</div>)}
          </div>
          <Button variant={copiedCodes ? 'success' : 'outline-primary'} className="w-100" onClick={handleCopyCodes}>
            {copiedCodes ? '✓ Copied to clipboard' : 'Copy All Codes'}
          </Button>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setShowRecoveryModal(false)}>I have saved my recovery codes</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default Profile;