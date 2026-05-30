/**
 * Profile Page
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Profile page with four tabs:
 * 1. Account Details  — name and email management
 * 2. Change Password  — password change with current password confirmation
 * 3. Security (MFA)   — enable/disable MFA, recovery codes, "can't scan" fallback
 * 4. Premium Settings — warranty alert preferences (PREMIUM users only)
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
  getPremiumSettings, updatePremiumSettings, sendTestAlert
} from '../services/api';

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

  // Tab 4: Premium Settings
  const [premiumSettings, setPremiumSettings] = useState(null);
  const [loadingPremium, setLoadingPremium] = useState(false);
  const [savingPremium, setSavingPremium] = useState(false);
  const [premiumSuccess, setPremiumSuccess] = useState('');
  const [premiumError, setPremiumError] = useState('');
  const [testAlertLoading, setTestAlertLoading] = useState(false);
  const [testAlertMsg, setTestAlertMsg] = useState('');

  const isPremium = profile?.role === 'PREMIUM' || user?.role === 'PREMIUM';

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
    } catch {
      setProfileLoadError('Failed to load profile. Please refresh the page.');
    } finally {
      setLoadingProfile(false);
    }
  };

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

  const extractSecret = (url) => {
    try { return new URL(url).searchParams.get('secret') || null; } catch { return null; }
  };

  // ── Tab 1 ────────────────────────────────────────────────────────────────
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

  // ── Tab 2 ────────────────────────────────────────────────────────────────
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

  // ── Tab 3: MFA ────────────────────────────────────────────────────────────
  const handleBeginMfa = async () => {
    setMfaError(''); setMfaSuccess(''); setMfaLoading(true); setShowSecretText(false);
    try {
      const response = await beginMfaSetup();
      setOtpauthUrl(response.data.otpauthUrl);
      setMfaStep('qr');
    } catch { setMfaError('Failed to start MFA setup.'); }
    finally { setMfaLoading(false); }
  };

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

  const handleResetMfa = () => {
    setMfaStep('idle'); setOtpauthUrl(''); setMfaToken('');
    setMfaError(''); setMfaSuccess(''); setShowSecretText(false);
  };

  const handleCopyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n')).then(() => {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    });
  };

  // ── Tab 4: Premium Settings ───────────────────────────────────────────────
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

  const [testAlertPreviewUrl, setTestAlertPreviewUrl] = useState('');

  const handleSendTestAlert = async () => {
    setTestAlertLoading(true); setTestAlertMsg(''); setTestAlertPreviewUrl('');
    try {
      const response = await sendTestAlert();
      setTestAlertMsg(response.data.message);
      setTestAlertPreviewUrl(response.data.previewUrl || '');
    } catch { setTestAlertMsg('Failed to send test alert.'); }
    finally { setTestAlertLoading(false); }
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

      <Tab.Container defaultActiveKey="details">
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
        </Nav>

        <Tab.Content>

          {/* ── Tab 1: Account Details ──────────────────────────────────────── */}
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
                        <Form.Label>Current Password <span className="text-danger">*</span>
                          <small className="text-muted ms-1">(required to confirm)</small>
                        </Form.Label>
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
          </Tab.Pane>

          {/* ── Tab 2: Change Password ──────────────────────────────────────── */}
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
                        <Form.Text className="text-muted">Min 12 chars with uppercase, lowercase, number, special character.</Form.Text>
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

          {/* ── Tab 3: Security (MFA) ───────────────────────────────────────── */}
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
                          <Button variant="outline-secondary" onClick={handleResetMfa} disabled={mfaLoading}>Cancel</Button>
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
                      <Alert variant="warning" className="text-start">
                        <strong>Your recovery codes were shown once.</strong> If you missed them, click below to view again.
                      </Alert>
                      {recoveryCodes.length > 0 && (
                        <Button variant="outline-primary" className="me-2" onClick={() => setShowRecoveryModal(true)}>View Recovery Codes</Button>
                      )}
                      <Button variant="outline-secondary" onClick={handleResetMfa}>Set Up Another Device</Button>
                    </Card.Body>
                  </Card>
                )}
              </Col>
            </Row>
          </Tab.Pane>

          {/* ── Tab 4: Premium Settings (PREMIUM only) ──────────────────────── */}
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
                        <div className="text-center">
                          <Button variant="primary" onClick={fetchPremiumSettings}>Load Settings</Button>
                        </div>
                      ) : (
                        <Form noValidate onSubmit={handleSavePremiumSettings}>
                          <Form.Group className="mb-3">
                            <Form.Check type="switch" id="alertsEnabled" label="Enable warranty expiry email alerts"
                              checked={premiumSettings.alertsEnabled}
                              onChange={(e) => setPremiumSettings(p => ({ ...p, alertsEnabled: e.target.checked }))} />
                            <Form.Text className="text-muted">
                              Receive email notifications before warranties expire.
                            </Form.Text>
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
                              <option value="daily">Daily digest — one email per day with all expiring items</option>
                              <option value="weekly">Weekly summary — sent every Monday morning</option>
                              <option value="immediate">Immediate — one email per expiring item</option>
                            </Form.Select>
                          </Form.Group>

                          {premiumSettings.lastAlertSent && (
                            <Alert variant="light" className="mb-3">
                              <small className="text-muted">
                                Last alert sent: {new Date(premiumSettings.lastAlertSent).toLocaleString('en-GB')}
                              </small>
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
                                {testAlertPreviewUrl && (
                                  <div className="mt-2">
                                    <a href={testAlertPreviewUrl} target="_blank" rel="noopener noreferrer"
                                      className="btn btn-sm btn-outline-primary">
                                      📧 Open Email Preview
                                    </a>
                                  </div>
                                )}
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