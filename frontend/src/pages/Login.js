/**
 * File: Login.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import { Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login, verifyMfaLogin, getCaptcha, resendVerification } from '../services/api';
import logoIcon from '../assets/logo-icon.svg';

/**
 * Login page component.
 * Handles user authentication with optional MFA verification.
 *
 * SECURITY NOTES:
 * - No client-side credential validation to prevent information leakage
 * - All login errors show the same generic message regardless of cause
 * - After 3 failed attempts, the backend requires a math CAPTCHA
 * - Unverified accounts are blocked; user is shown a "Resend email" option
 */
const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser } = useAuth();
  const infoMessage = location.state?.message;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');

  // CAPTCHA state
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captcha, setCaptcha] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);

  // Email verification state
  const [showUnverified, setShowUnverified] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // MFA state
  const [showMfa, setShowMfa] = useState(false);
  const [mfaUserId, setMfaUserId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * Fetches a new math CAPTCHA challenge from the backend.
   */
  const fetchCaptcha = async () => {
    setLoadingCaptcha(true);
    try {
      const response = await getCaptcha();
      setCaptcha(response.data);
      setCaptchaAnswer('');
    } catch (err) {
      console.error('Failed to fetch captcha:', err);
    } finally {
      setLoadingCaptcha(false);
    }
  };

  /**
   * Handles the login form submission.
   * Passes captcha fields only when the CAPTCHA is currently shown.
   */
  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (showCaptcha && (!captcha || !captchaAnswer.trim())) {
      setError('Please answer the security question');
      return;
    }

    setLoading(true);
    setShowUnverified(false);
    setResendSuccess(false);

    try {
      const response = await login(
        email,
        password,
        showCaptcha ? captcha?.captchaId : null,
        showCaptcha ? captchaAnswer.trim() : null
      );

      setError('');

      if (response.data.mfaRequired) {
        setShowMfa(true);
        setMfaUserId(response.data.userId);
      } else {
        loginUser(response.data.token);
        navigate('/dashboard');
      }

    } catch (err) {
      const responseData = err.response?.data;

      // Handle unverified email — show a dedicated prompt instead of generic error
      if (err.response?.status === 403 && responseData?.emailNotVerified) {
        setShowUnverified(true);
        setUnverifiedEmail(responseData.email || email);
        setError('');
      } else {
        setError('Invalid email or password');

        // If captcha is now required, fetch one and show it
        if (responseData?.requiresCaptcha) {
          setShowCaptcha(true);
          if (!captcha || responseData?.captchaExpired) {
            await fetchCaptcha();
          }
        }
      }

      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Resends the verification email to the unverified account.
   */
  const handleResendVerification = async () => {
    setResendLoading(true);
    setResendSuccess(false);
    try {
      await resendVerification(unverifiedEmail);
      setResendSuccess(true);
    } catch (err) {
      console.error('Resend verification error:', err);
    } finally {
      setResendLoading(false);
    }
  };

  /**
   * Handles MFA token or recovery code verification.
   */
  const handleMfaVerify = async (e) => {
    e.preventDefault();

    if (!mfaToken || mfaToken.length < 6) {
      setError('Please enter a valid code');
      return;
    }

    setLoading(true);

    try {
      const response = await verifyMfaLogin(mfaUserId, mfaToken);
      setError('');
      loginUser(response.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid code. Please try again.');
      console.error('MFA verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cancels the MFA step and returns the user to the email/password form.
  const handleBackToLogin = () => {
    setShowMfa(false);
    setMfaToken('');
    setMfaUserId(null);
    setError('');
  };

  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <Link to="/">
          <img src={logoIcon} alt="WhereIsIt?" className="auth-logo" />
        </Link>
        <Card className="auth-card">
          <Card.Body className="p-4 p-md-5">
              <h2 className="text-center mb-1 fw-bold">
                {showMfa ? 'Two-Factor Authentication' : 'Welcome back'}
              </h2>
              {!showMfa && (
                <p className="text-center text-secondary mb-4">Login to your WhereIsIt? account</p>
              )}

              {infoMessage && !error && <Alert variant="info" className="mb-3">{infoMessage}</Alert>}
              {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

              {/* Unverified email prompt */}
              {showUnverified && (
                <Alert variant="warning" className="mb-3">
                  <strong>Email not verified.</strong>
                  <p className="mb-2 mt-1">
                    You need to verify your email address before you can log in.
                    Check your inbox for the verification email we sent when you registered.
                  </p>
                  {resendSuccess ? (
                    <p className="mb-0 text-success fw-semibold">
                      ✓ A new verification email has been sent. Check your inbox.
                    </p>
                  ) : (
                    <Button
                      variant="outline-warning"
                      size="sm"
                      onClick={handleResendVerification}
                      disabled={resendLoading}
                    >
                      {resendLoading ? (
                        <><Spinner as="span" animation="border" size="sm" className="me-1" />Sending...</>
                      ) : 'Resend verification email'}
                    </Button>
                  )}
                </Alert>
              )}

              {!showMfa ? (
                <Form noValidate onSubmit={handleLogin}>
                  <Form.Group className="mb-3">
                    <Form.Label>Email address</Form.Label>
                    <Form.Control type="email" placeholder="Enter email" value={email}
                      onChange={(e) => setEmail(e.target.value)} disabled={loading} />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Password</Form.Label>
                    <Form.Control type="password" placeholder="Password" value={password}
                      onChange={(e) => setPassword(e.target.value)} disabled={loading} />
                  </Form.Group>

                  {/* CAPTCHA — shown after 3 failed attempts */}
                  {showCaptcha && (
                    <div className="border rounded p-3 mb-3 bg-light">
                      <p className="mb-2 small text-muted">
                        <strong>Security check</strong> — too many failed attempts detected.
                      </p>
                      {loadingCaptcha ? (
                        <div className="text-center">
                          <Spinner animation="border" size="sm" />
                          <span className="ms-2 small">Loading question...</span>
                        </div>
                      ) : captcha ? (
                        <>
                          <Form.Group>
                            <Form.Label className="fw-semibold">{captcha.question}</Form.Label>
                            <Form.Control type="number" placeholder="Your answer"
                              value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)}
                              disabled={loading} style={{ maxWidth: '120px' }} />
                          </Form.Group>
                          <Button variant="link" size="sm" className="p-0 mt-1"
                            onClick={fetchCaptcha} disabled={loading || loadingCaptcha}>
                            Get a different question
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline-secondary" size="sm" onClick={fetchCaptcha}>
                          Load security question
                        </Button>
                      )}
                    </div>
                  )}

                  <Button variant="primary" type="submit" className="w-100" disabled={loading}>
                    {loading ? (
                      <><Spinner as="span" animation="border" size="sm" className="me-2" />Logging in...</>
                    ) : 'Login'}
                  </Button>
                </Form>
              ) : (
                // MFA / Recovery code step
                <Form noValidate onSubmit={handleMfaVerify}>
                  <Alert variant="info">
                    <strong>Enter your verification code</strong>
                    <ul className="mb-0 mt-2">
                      <li>Open your authenticator app and enter the <strong>6-digit code</strong>, or</li>
                      <li>Use one of your <strong>recovery codes</strong> (format: XXXXXX-XXXXXX-XXXXXX) if you have lost access to your authenticator app</li>
                    </ul>
                  </Alert>

                  <Form.Group className="mb-3">
                    <Form.Label>Code</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="000000 or XXXXXX-XXXXXX-XXXXXX"
                      value={mfaToken}
                      onChange={(e) => setMfaToken(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))}
                      maxLength={30}
                      disabled={loading}
                      autoFocus
                      style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                    />
                    <Form.Text className="text-muted">
                      Recovery codes are in your saved backup — each one can only be used once.
                    </Form.Text>
                  </Form.Group>

                  <Button variant="primary" type="submit" className="w-100 mb-2" disabled={loading}>
                    {loading ? (
                      <><Spinner as="span" animation="border" size="sm" className="me-2" />Verifying...</>
                    ) : 'Verify and Login'}
                  </Button>

                  <Button variant="secondary" className="w-100" onClick={handleBackToLogin} disabled={loading}>
                    Back to Login
                  </Button>
                </Form>
              )}

              {!showMfa && (
                <div className="text-center mt-3">
                  <p>Don't have an account? <Link to="/register">Register here</Link></p>
                  <p><Link to="/forgot-password">Forgot your password?</Link></p>
                </div>
              )}
          </Card.Body>
        </Card>
        <p className="auth-footer-link">
          <Link to="/">← Back to home</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;