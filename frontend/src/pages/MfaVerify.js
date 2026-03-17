/**
 * File: MfaVerify.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Container, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { verifyMfaLogin } from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * MFA Verification Page
 * Handles MFA token verification during login process.
 * 
 * WORKFLOW:
 * 1. User enters email/password on Login page
 * 2. If MFA is enabled, login redirects here with userId
 * 3. User enters 6-digit code from authenticator app
 * 4. Backend verifies token and returns JWT
 * 5. User is logged in and redirected to dashboard
 * 
 * SECURITY:
 * - UserId passed via state (not URL params) to prevent enumeration
 * - Token is validated server-side (never trust client)
 * - Failed attempts are rate-limited on backend
 * - No sensitive data exposed in error messages
 */
function MfaVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser } = useAuth();

  // Get userId from navigation state (passed from Login page)
  const userId = location.state?.userId;

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * Redirect if no userId is provided.
   * This prevents direct access to this page without proper login flow.
   */
  useEffect(() => {
    if (!userId) {
      setError('Invalid session. Please log in again.');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    }
  }, [userId, navigate]);

  /**
   * Handles form submission for MFA token verification.
   * @param {Event} e - Form submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate token format
    if (!token || token.trim().length < 6) {
      setError('Please enter a valid 6-8 digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await verifyMfaLogin(userId, token.trim());

      if (response.data.token) {
        // MFA verification successful, log user in
        loginUser(response.data.token);
        navigate('/dashboard');
      } else {
        setError('Verification failed. Please try again.');
        setToken(''); // Clear input
      }
    } catch (err) {
      // Extract error message from response
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          'Invalid token. Please try again.';
      setError(errorMessage);
      setToken(''); // Clear input on error
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles input change with sanitization.
   * Only allows numeric input for security token.
   * @param {Event} e - Input change event
   */
  const handleTokenChange = (e) => {
    // Only allow numbers and limit to 8 digits
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setToken(value);
  };

  /**
   * Handles cancellation and returns to login page.
   */
  const handleCancel = () => {
    navigate('/login');
  };

  return (
    <Container className="mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-4">
          <Card>
            <Card.Header className="bg-primary text-white">
              <h4 className="mb-0">
                <i className="bi bi-shield-lock me-2"></i>
                Two-Factor Authentication
              </h4>
            </Card.Header>
            <Card.Body>
              {error && (
                <Alert variant="danger" onClose={() => setError('')} dismissible>
                  {error}
                </Alert>
              )}

              <p className="text-muted mb-4">
                Enter the 6-digit verification code from your authenticator app to complete login.
              </p>

              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Verification Code</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="000000"
                    value={token}
                    onChange={handleTokenChange}
                    disabled={loading || !userId}
                    maxLength={8}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    className="text-center fs-4 letter-spacing"
                    style={{ letterSpacing: '0.5em', fontFamily: 'monospace' }}
                  />
                  <Form.Text className="text-muted">
                    The code refreshes every 30 seconds
                  </Form.Text>
                </Form.Group>

                <div className="d-grid gap-2">
                  <Button 
                    variant="primary" 
                    type="submit" 
                    disabled={loading || token.length < 6 || !userId}
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
                      'Verify and Login'
                    )}
                  </Button>

                  <Button 
                    variant="outline-secondary" 
                    onClick={handleCancel}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </Form>

              <div className="mt-4">
                <Alert variant="info" className="mb-0">
                  <small>
                    <strong>Tip:</strong> If you've lost access to your authenticator app, 
                    please contact support for account recovery.
                  </small>
                </Alert>
              </div>
            </Card.Body>
          </Card>
        </div>
      </div>
    </Container>
  );
}

export default MfaVerify;