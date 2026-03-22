/**
 * File: MfaSetup.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react';
import { beginMfaSetup, confirmMfaSetup } from '../services/api';

/**
 * MFA Setup page component.
 * Allows users to enable two-factor authentication.
 * 
 * SECURITY NOTES:
 * - Uses TOTP (Time-based One-Time Password) standard
 * - QR code contains otpauth:// URL for authenticator apps
 * - Requires token verification before enabling MFA
 * - Secret is generated server-side and never exposed to client
 * 
 * Process:
 * 1. User requests MFA setup
 * 2. Backend generates secret and returns otpauth URL
 * 3. User scans QR code with authenticator app
 * 4. User enters first token to confirm setup
 * 5. MFA is enabled only after successful verification
 */
const MfaSetup = () => {
  const [step, setStep] = useState('initial'); // initial, qr, complete
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * Initiates MFA setup by requesting otpauth URL.
   */
  const handleBeginSetup = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await beginMfaSetup();
      setOtpauthUrl(response.data.otpauthUrl);
      setStep('qr');
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
      } else {
        setError('Failed to start MFA setup. Please try again.');
      }
      console.error('MFA setup error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verifies the first TOTP token to confirm MFA setup.
   */
  const handleConfirmSetup = async (e) => {
    e.preventDefault();

    if (!token || token.length < 6) {
      setError('Please enter a valid 6-digit token');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await confirmMfaSetup(token);

      if (response.data.success) {
        setStep('complete');
      } else {
        setError('Invalid token. Please check your authenticator app and try again.');
      }
    } catch (err) {
      setError('Failed to verify token. Please try again.');
      console.error('MFA confirmation error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Resets the setup process.
   */
  const handleReset = () => {
    setStep('initial');
    setOtpauthUrl('');
    setToken('');
    setError('');
  };

  return (
    <Container className="main-container">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <h1 className="mb-4 text-center">Multi-Factor Authentication Setup</h1>

          {error && (
            <Alert variant="danger" dismissible onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* Step 1: Introduction */}
          {step === 'initial' && (
            <Card>
              <Card.Body>
                <h4 className="mb-3">Enhance Your Account Security</h4>
                <p>
                  Multi-Factor Authentication (MFA) adds an extra layer of security to your account.
                  When enabled, you'll need to enter a code from your authenticator app in addition
                  to your password when logging in.
                </p>

                <Alert variant="info">
                  <strong>What you'll need:</strong>
                  <ul className="mb-0 mt-2">
                    <li>An authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)</li>
                    <li>Your smartphone or tablet</li>
                  </ul>
                </Alert>

                <h5 className="mt-4 mb-3">How it works:</h5>
                <ol>
                  <li>We'll generate a unique QR code for your account</li>
                  <li>Scan the QR code with your authenticator app</li>
                  <li>Enter the 6-digit code from your app to confirm</li>
                  <li>MFA will be enabled on your account</li>
                </ol>

                <Button
                  variant="primary"
                  className="w-100 mt-3"
                  onClick={handleBeginSetup}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                        className="me-2"
                      />
                      Setting up...
                    </>
                  ) : (
                    'Begin MFA Setup'
                  )}
                </Button>
              </Card.Body>
            </Card>
          )}

          {/* Step 2: QR Code and Verification */}
          {step === 'qr' && (
            <Card>
              <Card.Body>
                <h4 className="mb-3">Scan QR Code</h4>
                
                <Alert variant="warning">
                  <strong>Important:</strong> Keep this QR code secure. If someone else scans it,
                  they can generate codes for your account.
                </Alert>

                <div className="text-center mb-4">
                  {otpauthUrl && (
                    <div className="d-inline-block p-3 bg-white border rounded">
                      <QRCodeSVG value={otpauthUrl} size={256} level="H" />
                    </div>
                  )}
                </div>

                <h5 className="mb-3">Verify Setup</h5>
                <p>
                  Open your authenticator app and scan the QR code above. Then enter the 6-digit
                  code shown in your app to complete setup.
                </p>

                <Form onSubmit={handleConfirmSetup}>
                  <Form.Group className="mb-3" controlId="formToken">
                    <Form.Label>Enter 6-digit Code</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="000000"
                      value={token}
                      onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                      maxLength={8}
                      required
                      disabled={loading}
                      autoFocus
                      style={{ fontSize: '1.5rem', letterSpacing: '0.5rem', textAlign: 'center' }}
                    />
                  </Form.Group>

                  <Button
                    variant="primary"
                    type="submit"
                    className="w-100 mb-2"
                    disabled={loading || token.length < 6}
                  >
                    {loading ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
                        Verifying...
                      </>
                    ) : (
                      'Verify and Enable MFA'
                    )}
                  </Button>

                  <Button
                    variant="secondary"
                    className="w-100"
                    onClick={handleReset}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          )}

          {/* Step 3: Success */}
          {step === 'complete' && (
            <Card className="border-success">
              <Card.Body>
                <div className="text-center">
                  <div className="text-success mb-3" style={{ fontSize: '4rem' }}>
                    ✓
                  </div>
                  <h4 className="text-success mb-3">MFA Successfully Enabled!</h4>
                  <p className="mb-4">
                    Your account is now protected with two-factor authentication. You'll need to
                    enter a code from your authenticator app when logging in.
                  </p>

                  <Alert variant="info">
                    <strong>Important Reminders:</strong>
                    <ul className="mb-0 mt-2 text-start">
                      <li>Keep your authenticator app backed up</li>
                      <li>Store backup codes in a secure location (if provided)</li>
                      <li>Don't share your MFA codes with anyone</li>
                      <li>Contact support if you lose access to your authenticator</li>
                    </ul>
                  </Alert>

                  <Button variant="primary" className="w-100 mt-3" onClick={handleReset}>
                    Setup Another Device
                  </Button>
                </div>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default MfaSetup;