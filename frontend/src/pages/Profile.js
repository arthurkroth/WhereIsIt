/**
 * File: Profile.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import {
  Container, Row, Col, Card, Form, Button,
  Alert, Spinner, Tab, Nav, Badge
} from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import {
  getProfile,
  updateProfile,
  changeEmail,
  changePassword,
  beginMfaSetup,
  confirmMfaSetup,
  disableMfa
} from '../services/api';

/**
 * Profile Page
 * Allows the authenticated user to view and manage their account settings.
 *
 * TABS:
 * 1. Account Details — view/edit first name, last name, email address
 * 2. Change Password — change password with current password confirmation
 * 3. Security (MFA)  — enable or disable two-factor authentication
 *
 * SECURITY NOTES:
 * - Email and password changes both require the current password to confirm identity
 * - MFA disable is logged in the audit trail
 * - All inputs are validated client-side and server-side
 */
function Profile() {
  const { user, loginUser } = useAuth();

  // Profile data loaded from the backend
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState('');

  // ── Tab 1: Account Details ───────────────────────────────────────────────
  const [nameForm, setNameForm] = useState({ firstName: '', lastName: '' });
  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPasswordForEmail: '' });
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [nameSuccess, setNameSuccess] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailError, setEmailError] = useState('');

  // ── Tab 2: Change Password ───────────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ── Tab 3: MFA ───────────────────────────────────────────────────────────
  const [mfaStep, setMfaStep] = useState('idle'); // idle, qr, complete
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');

  /**
   * Loads the user's profile from the backend when the page mounts.
   */
  useEffect(() => {
    fetchProfile();
  }, []);

  /**
   * Fetches the current user's profile from the backend and populates forms.
   */
  const fetchProfile = async () => {
    setLoadingProfile(true);
    setProfileLoadError('');
    try {
      const response = await getProfile();
      const data = response.data.profile;
      setProfile(data);

      // Pre-populate the name form with current values
      setNameForm({
        firstName: data.firstName || '',
        lastName: data.lastName || ''
      });

      // Pre-populate the email form's new email field with current email
      setEmailForm(prev => ({ ...prev, newEmail: data.email || '' }));

    } catch (err) {
      setProfileLoadError('Failed to load profile. Please refresh the page.');
      console.error('Profile load error:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  // ============================================================================
  // TAB 1: ACCOUNT DETAILS HANDLERS
  // ============================================================================

  /**
   * Handles saving the updated first and last name.
   * @param {Event} e - Submit event
   */
  const handleSaveName = async (e) => {
    e.preventDefault();
    setNameSuccess('');
    setNameError('');

    if (!nameForm.firstName.trim() || !nameForm.lastName.trim()) {
      setNameError('Both first name and last name are required');
      return;
    }

    setSavingName(true);
    try {
      await updateProfile(nameForm.firstName.trim(), nameForm.lastName.trim());
      setNameSuccess('Name updated successfully');
      // Refresh profile data
      await fetchProfile();
    } catch (err) {
      setNameError(err.response?.data?.error || 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  /**
   * Handles changing the email address.
   * Requires the current password to confirm identity.
   * @param {Event} e - Submit event
   */
  const handleChangeEmail = async (e) => {
    e.preventDefault();
    setEmailSuccess('');
    setEmailError('');

    if (!emailForm.newEmail.trim()) {
      setEmailError('New email address is required');
      return;
    }
    if (!emailForm.currentPasswordForEmail) {
      setEmailError('Current password is required to change your email');
      return;
    }

    setSavingEmail(true);
    try {
      await changeEmail(emailForm.newEmail.trim(), emailForm.currentPasswordForEmail);
      setEmailSuccess('Email address updated successfully');
      setEmailForm(prev => ({ ...prev, currentPasswordForEmail: '' }));
      await fetchProfile();
    } catch (err) {
      setEmailError(err.response?.data?.error || 'Failed to update email');
    } finally {
      setSavingEmail(false);
    }
  };

  // ============================================================================
  // TAB 2: CHANGE PASSWORD HANDLERS
  // ============================================================================

  /**
   * Handles changing the user's password.
   * All three fields (current, new, confirm) are required.
   * @param {Event} e - Submit event
   */
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordSuccess('');
    setPasswordError('');

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('All password fields are required');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 10) {
      setPasswordError('New password must be at least 10 characters');
      return;
    }
    if (passwordForm.newPassword === passwordForm.currentPassword) {
      setPasswordError('New password must be different from your current password');
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        passwordForm.confirmPassword
      );
      setPasswordSuccess('Password changed successfully');
      // Clear all password fields after success
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  // ============================================================================
  // TAB 3: MFA HANDLERS
  // ============================================================================

  /**
   * Starts the MFA setup flow by requesting an otpauth URL from the backend.
   */
  const handleBeginMfa = async () => {
    setMfaError('');
    setMfaSuccess('');
    setMfaLoading(true);
    try {
      const response = await beginMfaSetup();
      setOtpauthUrl(response.data.otpauthUrl);
      setMfaStep('qr');
    } catch (err) {
      setMfaError('Failed to start MFA setup. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  };

  /**
   * Verifies the first TOTP token to complete MFA setup.
   * @param {Event} e - Submit event
   */
  const handleConfirmMfa = async (e) => {
    e.preventDefault();
    if (!mfaToken || mfaToken.length < 6) {
      setMfaError('Please enter a valid 6-digit code');
      return;
    }
    setMfaLoading(true);
    setMfaError('');
    try {
      const response = await confirmMfaSetup(mfaToken);
      if (response.data.success) {
        setMfaStep('complete');
        setMfaSuccess('MFA has been enabled on your account');
        setMfaToken('');
        await fetchProfile();
      } else {
        setMfaError('Invalid code. Please check your authenticator app and try again.');
      }
    } catch (err) {
      setMfaError('Failed to verify code. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  };

  /**
   * Disables MFA for the user's account after a confirmation prompt.
   */
  const handleDisableMfa = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to disable two-factor authentication? This will make your account less secure.'
    );
    if (!confirmed) return;

    setMfaLoading(true);
    setMfaError('');
    setMfaSuccess('');
    try {
      await disableMfa();
      setMfaSuccess('MFA has been disabled');
      setMfaStep('idle');
      await fetchProfile();
    } catch (err) {
      setMfaError('Failed to disable MFA. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  };

  /**
   * Resets the MFA flow back to the idle state (e.g. if the user cancels setup).
   */
  const handleResetMfa = () => {
    setMfaStep('idle');
    setOtpauthUrl('');
    setMfaToken('');
    setMfaError('');
    setMfaSuccess('');
  };

  // ============================================================
  // RENDER: Loading / Error state
  // ============================================================

  if (loadingProfile) {
    return (
      <Container className="mt-0 text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-muted">Loading your profile...</p>
      </Container>
    );
  }

  if (profileLoadError) {
    return (
      <Container className="mt-0">
        <Alert variant="danger">{profileLoadError}</Alert>
      </Container>
    );
  }

  // ============================================================
  // RENDER: Main profile page
  // ============================================================
  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">My Profile</h2>
        <div>
          <Badge bg="secondary" className="me-2">{profile?.role}</Badge>
          <small className="text-muted">
            Member since {profile?.createdAt
              ? new Date(profile.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })
              : 'N/A'
            }
          </small>
        </div>
      </div>

      <Tab.Container defaultActiveKey="details">
        {/* Tab navigation */}
        <Nav variant="tabs" className="mb-4">
          <Nav.Item>
            <Nav.Link eventKey="details">Account Details</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="password">Change Password</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="security">
              Security (MFA)
              {profile?.mfaEnabled
                ? <Badge bg="success" className="ms-2">Enabled</Badge>
                : <Badge bg="warning" text="dark" className="ms-2">Disabled</Badge>
              }
            </Nav.Link>
          </Nav.Item>
        </Nav>

        <Tab.Content>

          {/* ── TAB 1: Account Details ────────────────────────────────────── */}
          <Tab.Pane eventKey="details">
            <Row>

              {/* Name update section */}
              <Col md={6} className="mb-4">
                <Card>
                  <Card.Header className="bg-primary text-white">
                    <strong>Personal Information</strong>
                  </Card.Header>
                  <Card.Body>
                    {nameSuccess && (
                      <Alert variant="success" onClose={() => setNameSuccess('')} dismissible>
                        {nameSuccess}
                      </Alert>
                    )}
                    {nameError && (
                      <Alert variant="danger" onClose={() => setNameError('')} dismissible>
                        {nameError}
                      </Alert>
                    )}

                    <Form noValidate onSubmit={handleSaveName}>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>First Name <span className="text-danger">*</span></Form.Label>
                            <Form.Control
                              type="text"
                              value={nameForm.firstName}
                              onChange={(e) => setNameForm(prev => ({ ...prev, firstName: e.target.value }))}
                              disabled={savingName}
                              placeholder="First name"
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>Last Name <span className="text-danger">*</span></Form.Label>
                            <Form.Control
                              type="text"
                              value={nameForm.lastName}
                              onChange={(e) => setNameForm(prev => ({ ...prev, lastName: e.target.value }))}
                              disabled={savingName}
                              placeholder="Last name"
                            />
                          </Form.Group>
                        </Col>
                      </Row>

                      <Button variant="primary" type="submit" disabled={savingName}>
                        {savingName ? (
                          <>
                            <Spinner as="span" animation="border" size="sm" className="me-2" />
                            Saving...
                          </>
                        ) : 'Save Name'}
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>

              {/* Email change section */}
              <Col md={6} className="mb-4">
                <Card>
                  <Card.Header className="bg-primary text-white">
                    <strong>Email Address</strong>
                  </Card.Header>
                  <Card.Body>
                    {emailSuccess && (
                      <Alert variant="success" onClose={() => setEmailSuccess('')} dismissible>
                        {emailSuccess}
                      </Alert>
                    )}
                    {emailError && (
                      <Alert variant="danger" onClose={() => setEmailError('')} dismissible>
                        {emailError}
                      </Alert>
                    )}

                    {/* Show current email as read-only context */}
                    <Form.Group className="mb-3">
                      <Form.Label>Current Email</Form.Label>
                      <Form.Control
                        type="email"
                        value={profile?.email || ''}
                        disabled
                        className="bg-light"
                      />
                    </Form.Group>

                    <Form noValidate onSubmit={handleChangeEmail}>
                      <Form.Group className="mb-3">
                        <Form.Label>New Email Address <span className="text-danger">*</span></Form.Label>
                        <Form.Control
                          type="email"
                          value={emailForm.newEmail}
                          onChange={(e) => setEmailForm(prev => ({ ...prev, newEmail: e.target.value }))}
                          disabled={savingEmail}
                          placeholder="new@example.com"
                        />
                      </Form.Group>

                      <Form.Group className="mb-3">
                        <Form.Label>
                          Current Password <span className="text-danger">*</span>
                          <small className="text-muted ms-1">(required to confirm this change)</small>
                        </Form.Label>
                        <Form.Control
                          type="password"
                          value={emailForm.currentPasswordForEmail}
                          onChange={(e) => setEmailForm(prev => ({ ...prev, currentPasswordForEmail: e.target.value }))}
                          disabled={savingEmail}
                          placeholder="Your current password"
                        />
                      </Form.Group>

                      <Button variant="primary" type="submit" disabled={savingEmail}>
                        {savingEmail ? (
                          <>
                            <Spinner as="span" animation="border" size="sm" className="me-2" />
                            Saving...
                          </>
                        ) : 'Change Email'}
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </Tab.Pane>

          {/* ── TAB 2: Change Password ────────────────────────────────────── */}
          <Tab.Pane eventKey="password">
            <Row className="justify-content-center">
              <Col md={6}>
                <Card>
                  <Card.Header className="bg-primary text-white">
                    <strong>Change Password</strong>
                  </Card.Header>
                  <Card.Body>
                    {passwordSuccess && (
                      <Alert variant="success" onClose={() => setPasswordSuccess('')} dismissible>
                        {passwordSuccess}
                      </Alert>
                    )}
                    {passwordError && (
                      <Alert variant="danger" onClose={() => setPasswordError('')} dismissible>
                        {passwordError}
                      </Alert>
                    )}

                    <Form noValidate onSubmit={handleChangePassword}>
                      <Form.Group className="mb-3">
                        <Form.Label>Current Password <span className="text-danger">*</span></Form.Label>
                        <Form.Control
                          type="password"
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                          disabled={savingPassword}
                          placeholder="Your current password"
                          autoComplete="current-password"
                        />
                      </Form.Group>

                      <Form.Group className="mb-3">
                        <Form.Label>New Password <span className="text-danger">*</span></Form.Label>
                        <Form.Control
                          type="password"
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                          disabled={savingPassword}
                          placeholder="Minimum 10 characters"
                          autoComplete="new-password"
                        />
                        <Form.Text className="text-muted">
                          Must be at least 10 characters and different from your current password.
                        </Form.Text>
                      </Form.Group>

                      <Form.Group className="mb-4">
                        <Form.Label>Confirm New Password <span className="text-danger">*</span></Form.Label>
                        <Form.Control
                          type="password"
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          disabled={savingPassword}
                          placeholder="Repeat your new password"
                          autoComplete="new-password"
                        />
                      </Form.Group>

                      <Button variant="primary" type="submit" disabled={savingPassword}>
                        {savingPassword ? (
                          <>
                            <Spinner as="span" animation="border" size="sm" className="me-2" />
                            Changing...
                          </>
                        ) : 'Change Password'}
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </Tab.Pane>

          {/* ── TAB 3: Security (MFA) ─────────────────────────────────────── */}
          <Tab.Pane eventKey="security">
            <Row className="justify-content-center">
              <Col md={7}>

                {mfaError && (
                  <Alert variant="danger" onClose={() => setMfaError('')} dismissible>
                    {mfaError}
                  </Alert>
                )}
                {mfaSuccess && (
                  <Alert variant="success" onClose={() => setMfaSuccess('')} dismissible>
                    {mfaSuccess}
                  </Alert>
                )}

                {/* MFA currently ENABLED — show status and disable option */}
                {profile?.mfaEnabled && mfaStep === 'idle' && (
                  <Card className="border-success">
                    <Card.Header className="bg-success text-white d-flex justify-content-between align-items-center">
                      <strong>Two-Factor Authentication</strong>
                      <Badge bg="light" text="dark">Active</Badge>
                    </Card.Header>
                    <Card.Body>
                      <p>
                        Your account is currently protected with two-factor authentication.
                        Each time you log in, you will need to enter a code from your authenticator app.
                      </p>
                      <Alert variant="info">
                        <strong>Tip:</strong> Make sure your authenticator app is backed up.
                        If you lose access, you may be locked out of your account.
                      </Alert>
                      <Button
                        variant="outline-danger"
                        onClick={handleDisableMfa}
                        disabled={mfaLoading}
                      >
                        {mfaLoading ? (
                          <>
                            <Spinner as="span" animation="border" size="sm" className="me-2" />
                            Disabling...
                          </>
                        ) : 'Disable MFA'}
                      </Button>
                    </Card.Body>
                  </Card>
                )}

                {/* MFA currently DISABLED — show setup introduction */}
                {!profile?.mfaEnabled && mfaStep === 'idle' && (
                  <Card>
                    <Card.Header className="bg-warning text-dark d-flex justify-content-between align-items-center">
                      <strong>Two-Factor Authentication</strong>
                      <Badge bg="dark">Not Enabled</Badge>
                    </Card.Header>
                    <Card.Body>
                      <p>
                        Two-factor authentication (MFA) adds an extra layer of security to your account.
                        When enabled, you will need a code from your authenticator app in addition
                        to your password each time you log in.
                      </p>
                      <Alert variant="info">
                        <strong>What you will need:</strong>
                        <ul className="mb-0 mt-2">
                          <li>An authenticator app (Google Authenticator, Authy, Microsoft Authenticator)</li>
                          <li>Your smartphone or tablet</li>
                        </ul>
                      </Alert>
                      <Button
                        variant="primary"
                        onClick={handleBeginMfa}
                        disabled={mfaLoading}
                        className="mt-2"
                      >
                        {mfaLoading ? (
                          <>
                            <Spinner as="span" animation="border" size="sm" className="me-2" />
                            Setting up...
                          </>
                        ) : 'Enable MFA'}
                      </Button>
                    </Card.Body>
                  </Card>
                )}

                {/* MFA setup step: QR code scan and token verification */}
                {mfaStep === 'qr' && (
                  <Card>
                    <Card.Header className="bg-primary text-white">
                      <strong>Scan QR Code</strong>
                    </Card.Header>
                    <Card.Body>
                      <Alert variant="warning">
                        <strong>Keep this QR code secure.</strong> If someone else scans it,
                        they will be able to generate codes for your account.
                      </Alert>

                      {/* QR code display */}
                      <div className="text-center mb-4">
                        {otpauthUrl && (
                          <div className="d-inline-block p-3 bg-white border rounded">
                            <QRCodeSVG value={otpauthUrl} size={220} level="H" />
                          </div>
                        )}
                      </div>

                      <p>
                        Open your authenticator app and scan the QR code above.
                        Then enter the 6-digit code it shows to complete setup.
                      </p>

                      <Form noValidate onSubmit={handleConfirmMfa}>
                        <Form.Group className="mb-3">
                          <Form.Label>Enter 6-digit Code <span className="text-danger">*</span></Form.Label>
                          <Form.Control
                            type="text"
                            placeholder="000000"
                            value={mfaToken}
                            onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
                            maxLength={8}
                            disabled={mfaLoading}
                            autoFocus
                            style={{ fontSize: '1.5rem', letterSpacing: '0.5rem', textAlign: 'center' }}
                          />
                        </Form.Group>

                        <div className="d-flex gap-2">
                          <Button
                            variant="primary"
                            type="submit"
                            disabled={mfaLoading || mfaToken.length < 6}
                          >
                            {mfaLoading ? (
                              <>
                                <Spinner as="span" animation="border" size="sm" className="me-2" />
                                Verifying...
                              </>
                            ) : 'Verify and Enable MFA'}
                          </Button>
                          <Button
                            variant="outline-secondary"
                            onClick={handleResetMfa}
                            disabled={mfaLoading}
                          >
                            Cancel
                          </Button>
                        </div>
                      </Form>
                    </Card.Body>
                  </Card>
                )}

                {/* MFA setup complete success card */}
                {mfaStep === 'complete' && (
                  <Card className="border-success">
                    <Card.Body className="text-center">
                      <div className="text-success mb-3" style={{ fontSize: '4rem' }}>✓</div>
                      <h4 className="text-success mb-3">MFA Successfully Enabled!</h4>
                      <p>
                        Your account is now protected with two-factor authentication.
                        You will need a code from your authenticator app each time you log in.
                      </p>
                      <Alert variant="info" className="text-start">
                        <strong>Reminders:</strong>
                        <ul className="mb-0 mt-2">
                          <li>Keep your authenticator app backed up</li>
                          <li>Do not share your MFA codes with anyone</li>
                          <li>Contact support if you lose access to your authenticator</li>
                        </ul>
                      </Alert>
                      <Button variant="outline-primary" className="mt-3" onClick={handleResetMfa}>
                        Set Up Another Device
                      </Button>
                    </Card.Body>
                  </Card>
                )}

              </Col>
            </Row>
          </Tab.Pane>

        </Tab.Content>
      </Tab.Container>
    </Container>
  );
}

export default Profile;