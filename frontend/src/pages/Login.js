/**
 * File: Login.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
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
 * - Password input type is 'password' to prevent shoulder surfing
 * - Client-side validation before API call
 * - Errors are displayed generically to prevent user enumeration
 * - MFA token input is separate step after password verification
 * - Form data is not logged or stored insecurely
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
  const [validated, setValidated] = useState(false);

  /**
   * Validates email format.
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  /**
   * Handles initial login form submission.
   * Either returns JWT or prompts for MFA.
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setValidated(true);

    // Client-side validation
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await login(email, password);

      // Check if MFA is required
      if (response.data.mfaRequired) {
        setShowMfa(true);
        setMfaUserId(response.data.userId);
      } else {
        // Login successful, no MFA required
        loginUser(response.data.token);
        navigate('/dashboard');
      }
    } catch (err) {
      // Generic error message to prevent user enumeration
      setError('Invalid email or password');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles MFA token verification.
   */
  const handleMfaVerify = async (e) => {
    e.preventDefault();

    if (!mfaToken || mfaToken.length < 6) {
      setError('Please enter a valid MFA token');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await verifyMfaLogin(mfaUserId, mfaToken);
      
      // MFA verification successful
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
   * Resets MFA form and goes back to login.
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

              {error && (
                <Alert variant="danger" className="mb-3">
                  {error}
                </Alert>
              )}

              {!showMfa ? (
                // Email and Password form
                <Form noValidate validated={validated} onSubmit={handleLogin}>
                  <Form.Group className="mb-3" controlId="formEmail">
                    <Form.Label>Email address</Form.Label>
                    <Form.Control
                      type="email"
                      placeholder="Enter email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <Form.Control.Feedback type="invalid">
                      Please provide a valid email.
                    </Form.Control.Feedback>
                  </Form.Group>

                  <Form.Group className="mb-3" controlId="formPassword">
                    <Form.Label>Password</Form.Label>
                    <Form.Control
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={10}
                      disabled={loading}
                    />
                    <Form.Control.Feedback type="invalid">
                      Password must be at least 10 characters.
                    </Form.Control.Feedback>
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
                // MFA Token form
                <Form onSubmit={handleMfaVerify}>
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
                      required
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