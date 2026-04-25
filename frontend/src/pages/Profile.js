/**
 * File: Profile.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
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
  beginMfaSetup, confirmMfaSetup, disableMfa
} from '../services/api';

/**
 * Profile Page
 * Allows the authenticated user to manage their account settings.
 *
 * TABS:
 * 1. Account Details — edit name and email address
 * 2. Change Password — change password with current password confirmation
 * 3. Security (MFA)  — enable/disable MFA, view recovery codes, "can't scan" fallback
 */
function Profile() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState('');

  // Tab 1: Account Details
  const [nameForm, setNameForm] = useState({ firstName: '', lastName: '' });
  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPasswordForEmail: '' });
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [nameSuccess, setNameSuccess] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailError, setEmailError] = useState('');

  // Tab 2: Change Password
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Tab 3: MFA
  const [mfaStep, setMfaStep] = useState('idle'); // idle | qr | complete
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [showSecretText, setShowSecretText] = useState(false); // "can't scan" fallback
  const [mfaToken, setMfaToken] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');

  // Recovery codes — returned exactly once after MFA setup
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    setLoadingProfile(true);
    setProfileLoadError('');
    try {
      const response = await getProfile();
      const data = response.data.profile;
      setProfile(data);
      setNameForm({ firstName: data.firstName || '', lastName: data.lastName || '' });
      setEmailForm(prev => ({ ...prev, newEmail: data.email || '' }));
    } catch (err) {
      setProfileLoadError('Failed to load profile. Please refresh the page.');
    } finally {
      setLoadingProfile(false);
    }
  };

  /**
   * Extracts the TOTP secret key from the otpauthUrl.
   * Used for the "can't scan QR code" fallback.
   * Format: otpauth://totp/label?secret=SECRET&issuer=...
   */
  const extractSecret = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get('secret') || null;
    } catch {
      return null;
    }
  };

  // ── Tab 1: Account Details ────────────────────────────────────────────────

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
      await fetchProfile();
    } catch (err) {
      setNameError(err.response?.data?.error || 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    setEmailSuccess('');
    setEmailError('');
    if (!emailForm.newEmail.trim()) { setEmailError('New email address is required'); return; }
    if (!emailForm.currentPasswordForEmail) { setEmailError('Current password is required'); return; }
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

  // ── Tab 2: Change Password ────────────────────────────────────────────────

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
    if (passwordForm.newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters');
      return;
    }
    if (passwordForm.newPassword === passwordForm.currentPassword) {
      setPasswordError('New password must be different from your current password');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword, passwordForm.confirmPassword);
      setPasswordSuccess('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Tab 3: MFA ────────────────────────────────────────────────────────────

  const handleBeginMfa = async () => {
    setMfaError('');
    setMfaSuccess('');
    setMfaLoading(true);
    setShowSecretText(false);
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
        // Store recovery codes to display in the modal
        setRecoveryCodes(response.data.recoveryCodes || []);
        setShowRecoveryModal(true);
        setMfaStep('complete');
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

  const handleDisableMfa = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to disable two-factor authentication? This will make your account less secure.'
    );
    if (!confirmed) return;
    setMfaLoading(true);
    setMfaError('');
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

  const handleResetMfa = () => {
    setMfaStep('idle');
    setOtpauthUrl('');
    setMfaToken('');
    setMfaError('');
    setMfaSuccess('');
    setShowSecretText(false);
  };

  /**
   * Copies all recovery codes to the clipboard as a single newline-separated string.
   */
  const handleCopyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n')).then(() => {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    });
  };

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

  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">My Profile</h2>
        <div>
          <Badge bg="secondary" className="me-2">{profile?.role}</Badge>
          <small className="text-muted">
            Member since {profile?.createdAt
              ? new Date(profile.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })
              : 'N/A'}
          </small>
        </div>
      </div>

      <Tab.Container defaultActiveKey="details">
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
                : <Badge bg="warning" text="dark" className="ms-2">Disabled</Badge>}
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
                    {nameSuccess && <Alert variant="success" onClose={() => setNameSuccess('')} dismissible>{nameSuccess}</Alert>}
                    {nameError && <Alert variant="danger" onClose={() => setNameError('')} dismissible>{nameError}</Alert>}
                    <Form noValidate onSubmit={handleSaveName}>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>First Name <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="text" value={nameForm.firstName}
                              onChange={(e) => setNameForm(p => ({ ...p, firstName: e.target.value }))}
                              disabled={savingName} />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>Last Name <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="text" value={nameForm.lastName}
                              onChange={(e) => setNameForm(p => ({ ...p, lastName: e.target.value }))}
                              disabled={savingName} />
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
                    {emailSuccess && <Alert variant="success" onClose={() => setEmailSuccess('')} dismissible>{emailSuccess}</Alert>}
                    {emailError && <Alert variant="danger" onClose={() => setEmailError('')} dismissible>{emailError}</Alert>}
                    <Form.Group className="mb-3">
                      <Form.Label>Current Email</Form.Label>
                      <Form.Control type="email" value={profile?.email || ''} disabled className="bg-light" />
                    </Form.Group>
                    <Form noValidate onSubmit={handleChangeEmail}>
                      <Form.Group className="mb-3">
                        <Form.Label>New Email Address <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="email" value={emailForm.newEmail}
                          onChange={(e) => setEmailForm(p => ({ ...p, newEmail: e.target.value }))}
                          disabled={savingEmail} />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Current Password <span className="text-danger">*</span>
                          <small className="text-muted ms-1">(required to confirm this change)</small>
                        </Form.Label>
                        <Form.Control type="password" value={emailForm.currentPasswordForEmail}
                          onChange={(e) => setEmailForm(p => ({ ...p, currentPasswordForEmail: e.target.value }))}
                          disabled={savingEmail} />
                      </Form.Group>
                      <Button variant="primary" type="submit" disabled={savingEmail}>
                        {savingEmail ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Saving...</> : 'Change Email'}
                      </Button>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </Tab.Pane>

          {/* ── Tab 2: Change Password ──────────────────────────────────── */}
          <Tab.Pane eventKey="password">
            <Row className="justify-content-center">
              <Col md={6}>
                <Card>
                  <Card.Header className="bg-primary text-white"><strong>Change Password</strong></Card.Header>
                  <Card.Body>
                    {passwordSuccess && <Alert variant="success" onClose={() => setPasswordSuccess('')} dismissible>{passwordSuccess}</Alert>}
                    {passwordError && <Alert variant="danger" onClose={() => setPasswordError('')} dismissible>{passwordError}</Alert>}
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
                        <Form.Text className="text-muted">
                          Min 12 characters with uppercase, lowercase, number, and special character.
                        </Form.Text>
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

          {/* ── Tab 3: Security (MFA) ────────────────────────────────────── */}
          <Tab.Pane eventKey="security">
            <Row className="justify-content-center">
              <Col md={7}>
                {mfaError && <Alert variant="danger" onClose={() => setMfaError('')} dismissible>{mfaError}</Alert>}
                {mfaSuccess && <Alert variant="success" onClose={() => setMfaSuccess('')} dismissible>{mfaSuccess}</Alert>}

                {/* MFA ENABLED — show status and recovery code count */}
                {profile?.mfaEnabled && mfaStep === 'idle' && (
                  <Card className="border-success">
                    <Card.Header className="bg-success text-white d-flex justify-content-between">
                      <strong>Two-Factor Authentication</strong>
                      <Badge bg="light" text="dark">Active</Badge>
                    </Card.Header>
                    <Card.Body>
                      <p>Your account is protected with two-factor authentication.</p>
                      {profile?.remainingRecoveryCodes > 0 && (
                        <Alert variant="info">
                          You have <strong>{profile.remainingRecoveryCodes}</strong> recovery code{profile.remainingRecoveryCodes !== 1 ? 's' : ''} remaining.
                          Keep these stored safely in case you lose access to your authenticator.
                        </Alert>
                      )}
                      {profile?.remainingRecoveryCodes === 0 && (
                        <Alert variant="warning">
                          You have no remaining recovery codes. Consider disabling and re-enabling MFA to generate new ones.
                        </Alert>
                      )}
                      <Button variant="outline-danger" onClick={handleDisableMfa} disabled={mfaLoading}>
                        {mfaLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Disabling...</> : 'Disable MFA'}
                      </Button>
                    </Card.Body>
                  </Card>
                )}

                {/* MFA DISABLED — show setup prompt */}
                {!profile?.mfaEnabled && mfaStep === 'idle' && (
                  <Card>
                    <Card.Header className="bg-warning text-dark d-flex justify-content-between">
                      <strong>Two-Factor Authentication</strong>
                      <Badge bg="dark">Not Enabled</Badge>
                    </Card.Header>
                    <Card.Body>
                      <p>Add an extra layer of security to your account with two-factor authentication.</p>
                      <Alert variant="info">
                        <strong>You will need:</strong>
                        <ul className="mb-0 mt-1">
                          <li>An authenticator app (Google Authenticator, Authy, Microsoft Authenticator)</li>
                          <li>Your smartphone or tablet</li>
                        </ul>
                      </Alert>
                      <Button variant="primary" onClick={handleBeginMfa} disabled={mfaLoading} className="mt-2">
                        {mfaLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Setting up...</> : 'Enable MFA'}
                      </Button>
                    </Card.Body>
                  </Card>
                )}

                {/* QR CODE STEP */}
                {mfaStep === 'qr' && (
                  <Card>
                    <Card.Header className="bg-primary text-white"><strong>Scan QR Code</strong></Card.Header>
                    <Card.Body>
                      <Alert variant="warning">
                        <strong>Keep this QR code secure.</strong> Do not share it with anyone.
                      </Alert>

                      <div className="text-center mb-3">
                        {otpauthUrl && (
                          <div className="d-inline-block p-3 bg-white border rounded">
                            <QRCodeSVG value={otpauthUrl} size={220} level="H" />
                          </div>
                        )}
                      </div>

                      {/* Can't scan fallback — shows the secret as text */}
                      <div className="text-center mb-3">
                        <Button variant="link" size="sm" onClick={() => setShowSecretText(!showSecretText)}>
                          {showSecretText ? 'Hide secret key' : "Can't scan the QR code? Click to show the secret key"}
                        </Button>
                      </div>

                      {showSecretText && extractSecret(otpauthUrl) && (
                        <Alert variant="secondary" className="text-center">
                          <small className="d-block mb-1 text-muted">
                            Enter this key manually into your authenticator app:
                          </small>
                          <code style={{ fontSize: '1.1rem', letterSpacing: '0.2em', wordBreak: 'break-all' }}>
                            {extractSecret(otpauthUrl)}
                          </code>
                        </Alert>
                      )}

                      <p>Open your authenticator app, scan the QR code, then enter the 6-digit code below.</p>

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
                          <Button variant="primary" type="submit" disabled={mfaLoading || mfaToken.length < 6}>
                            {mfaLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Verifying...</> : 'Verify and Enable MFA'}
                          </Button>
                          <Button variant="outline-secondary" onClick={handleResetMfa} disabled={mfaLoading}>Cancel</Button>
                        </div>
                      </Form>
                    </Card.Body>
                  </Card>
                )}

                {/* SETUP COMPLETE */}
                {mfaStep === 'complete' && (
                  <Card className="border-success">
                    <Card.Body className="text-center">
                      <div className="text-success mb-3" style={{ fontSize: '4rem' }}>✓</div>
                      <h4 className="text-success mb-3">MFA Successfully Enabled!</h4>
                      <p>Your account is now protected with two-factor authentication.</p>
                      <Alert variant="warning" className="text-start">
                        <strong>Your recovery codes were shown once.</strong> If you missed them, click below to view them again. Once this page is closed they cannot be retrieved — disable and re-enable MFA to generate new ones.
                      </Alert>
                      {recoveryCodes.length > 0 && (
                        <Button variant="outline-primary" className="me-2" onClick={() => setShowRecoveryModal(true)}>
                          View Recovery Codes
                        </Button>
                      )}
                      <Button variant="outline-secondary" onClick={handleResetMfa}>Set Up Another Device</Button>
                    </Card.Body>
                  </Card>
                )}
              </Col>
            </Row>
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>

      {/* Recovery Codes Modal — shown once after MFA setup */}
      <Modal show={showRecoveryModal} onHide={() => setShowRecoveryModal(false)} size="md" centered>
        <Modal.Header closeButton>
          <Modal.Title>Recovery Codes</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="warning">
            <strong>Save these codes now.</strong> Each code can only be used once.
            Store them securely — they are shown here only and cannot be retrieved again.
          </Alert>
          <div className="bg-light border rounded p-3 mb-3 font-monospace text-center">
            {recoveryCodes.map((code, i) => (
              <div key={i} className="py-1" style={{ letterSpacing: '0.1em' }}>{code}</div>
            ))}
          </div>
          <Button
            variant={copiedCodes ? 'success' : 'outline-primary'}
            className="w-100"
            onClick={handleCopyCodes}
          >
            {copiedCodes ? '✓ Copied to clipboard' : 'Copy All Codes'}
          </Button>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setShowRecoveryModal(false)}>
            I have saved my recovery codes
          </Button>
        </Modal.Footer>
      </Modal>

    </Container>
  );
}

export default Profile;