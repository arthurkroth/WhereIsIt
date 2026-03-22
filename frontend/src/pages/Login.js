/**
 * File: Login.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login, verifyMfaLogin } from '../services/api';

/**
 * Login page component.
 * Handles user authentication with optional MFA verification.
 *
 * SECURITY NOTES:
 * - No client-side email format or password length validation on login.
 *   This is intentional - validating these fields before the API call
 *   would leak information about what is wrong (e.g. "invalid email format"
 *   vs "wrong password"), which could aid enumeration attacks.
 * - All login errors show the same generic message: "Invalid email or password"
 * - The error message is never cleared automatically - only on a new submission
 *   attempt, so the user always has time to read it
 * - Password input type is 'password' to prevent shoulder surfing
 * - MFA token input is a separate step after password verification
 */
const Login = () => {
  const navigate = useNavigate();
  const { loginUser } = useAuth();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');

  // UI state
  const [showMfa, setShowMfa] = useState(false);
  const [mfaUserId, setMfaUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * Handles the login form submission.
   *
   * SECURITY: Only checks that fields are not empty before calling the API.
   * We deliberately do NOT validate email format or password length here,
   * as doing so would reveal information about what is wrong with the input.
   * All validation errors from the backend are shown as the same generic message.
   */
  const handleLogin = async (e) => {
    e.preventDefault();

    // Only check that fields are not empty - no further client-side validation
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const response = await login(email, password);

      // Clear any previous error only on a successful API response
      setError('');

      if (response.data.mfaRequired) {
        // MFA is required - show the MFA token form
        setShowMfa(true);
        setMfaUserId(response.data.userId);
      } else {
        // Login successful with no MFA
        loginUser(response.data.token);
        navigate('/dashboard');
      }
    } catch (err) {
      // Always show the same generic error regardless of what went wrong.
      // This prevents attackers from knowing whether the email exists,
      // whether the password was close, or any other details.
      setError('Invalid email or password');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles MFA token verification after the initial login step.
   */
  const handleMfaVerify = async (e) => {
    e.preventDefault();

    if (!mfaToken || mfaToken.length < 6) {
      setError('Please enter a valid MFA token');
      return;
    }

    setLoading(true);

    try {
      const response = await verifyMfaLogin(mfaUserId, mfaToken);
      setError('');
      loginUser(response.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid MFA token. Please try again.');
      console.error('MFA verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Resets the MFA form and returns to the email/password step.
   */
  const handleBackToLogin = () => {
    setShowMfa(false);
    setMfaToken('');
    setMfaUserId(null);
    setError('');
  };

  return (
    <Container className="main-container">
      <Row className="justify-content-center">
        <Col md={6} lg={5}>
          <Card>
            <Card.Body>
              <h2 className="text-center mb-4">
                {showMfa ? 'Enter MFA Token' : 'Login to WhereIsIt?'}
              </h2>

              {/* Error alert - not dismissible so it stays visible until next attempt */}
              {error && (
                <Alert variant="danger" className="mb-3">
                  {error}
                </Alert>
              )}

              {!showMfa ? (
                // Email and password form
                <Form noValidate onSubmit={handleLogin}>
                  <Form.Group className="mb-3" controlId="formEmail">
                    <Form.Label>Email address</Form.Label>
                    <Form.Control
                      type="email"
                      placeholder="Enter email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                    />
                  </Form.Group>

                  <Form.Group className="mb-3" controlId="formPassword">
                    <Form.Label>Password</Form.Label>
                    <Form.Control
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                  </Form.Group>

                  <Button
                    variant="primary"
                    type="submit"
                    className="w-100"
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
                        Logging in...
                      </>
                    ) : (
                      'Login'
                    )}
                  </Button>
                </Form>
              ) : (
                // MFA token form - shown after successful password verification
                <Form noValidate onSubmit={handleMfaVerify}>
                  <Alert variant="info">
                    Please enter the 6-digit code from your authenticator app.
                  </Alert>

                  <Form.Group className="mb-3" controlId="formMfaToken">
                    <Form.Label>MFA Token</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="000000"
                      value={mfaToken}
                      onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
                      maxLength={8}
                      disabled={loading}
                      autoFocus
                    />
                  </Form.Group>

                  <Button
                    variant="primary"
                    type="submit"
                    className="w-100 mb-2"
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
                        Verifying...
                      </>
                    ) : (
                      'Verify MFA'
                    )}
                  </Button>

                  <Button
                    variant="secondary"
                    className="w-100"
                    onClick={handleBackToLogin}
                    disabled={loading}
                  >
                    Back to Login
                  </Button>
                </Form>
              )}

              <div className="text-center mt-3">
                <p>
                  Don't have an account? <Link to="/register">Register here</Link>
                </p>
                <p>
                  <Link to="/forgot-password">Forgot your password?</Link>
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Login;