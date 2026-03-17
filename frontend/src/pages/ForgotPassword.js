/**
 * File: ForgotPassword.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import { Container, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../services/api';

/**
 * ForgotPassword Page
 * Allows users to request a password reset by entering their email.
 * 
 * SECURITY FEATURES:
 * - Always shows success message (prevents email enumeration)
 * - Token sent via email in production (displayed for dev)
 * - Rate limited on backend
 * 
 * WORKFLOW:
 * 1. User enters email address
 * 2. Backend generates secure reset token
 * 3. In production: Email sent with reset link
 * 4. In development: Token displayed on screen
 * 5. User clicks link (or copies token) to reset password
 */
function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetInfo, setResetInfo] = useState(null);

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
   * Handles form submission to request password reset.
   * @param {Event} e - Form submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate email
    if (!email || !isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);
    setResetInfo(null);

    try {
      const response = await forgotPassword(email);
      
      setSuccess(true);
      
      // In development, backend returns the token
      // In production, user gets an email instead
      if (response.data.resetToken) {
        setResetInfo({
          token: response.data.resetToken,
          url: response.data.resetUrl
        });
      }
      
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <Card>
            <Card.Header className="bg-primary text-white">
              <h4 className="mb-0">Forgot Password</h4>
            </Card.Header>
            <Card.Body>
              {error && (
                <Alert variant="danger" className="mb-3">
                  {error}
                </Alert>
              )}

              {success && !resetInfo && (
                <Alert variant="success">
                  <strong>Check your email!</strong>
                  <p className="mb-0 mt-2">
                    If an account exists with that email, you will receive a password reset link shortly.
                  </p>
                </Alert>
              )}

              {success && resetInfo && (
                <Alert variant="info">
                  <strong>Development Mode</strong>
                  <p className="mt-2 mb-2">
                    In production, you would receive an email. For development, use this link:
                  </p>
                  <div className="bg-light p-3 rounded mb-2">
                    <code className="text-break">{resetInfo.url}</code>
                  </div>
                  <p className="mb-2">Or copy this token:</p>
                  <div className="bg-light p-2 rounded">
                    <code>{resetInfo.token}</code>
                  </div>
                  <hr />
                  <div className="d-grid">
                    <Button 
                      variant="primary" 
                      href={resetInfo.url}
                      size="sm"
                    >
                      Go to Reset Password Page
                    </Button>
                  </div>
                </Alert>
              )}

              {!success && (
                <>
                  <p className="text-muted mb-4">
                    Enter your email address and we'll send you a link to reset your password.
                  </p>

                  <Form onSubmit={handleSubmit}>
                    <Form.Group className="mb-3">
                      <Form.Label>Email Address</Form.Label>
                      <Form.Control
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        required
                        autoFocus
                      />
                      <Form.Text className="text-muted">
                        We'll send password reset instructions to this email.
                      </Form.Text>
                    </Form.Group>

                    <div className="d-grid gap-2">
                      <Button 
                        variant="primary" 
                        type="submit" 
                        disabled={loading || !email}
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
                            Sending...
                          </>
                        ) : (
                          'Send Reset Link'
                        )}
                      </Button>
                    </div>
                  </Form>
                </>
              )}

              <div className="text-center mt-4">
                <p className="mb-0">
                  <Link to="/login">Back to Login</Link>
                </p>
                <p className="mb-0">
                  Don't have an account? <Link to="/register">Register</Link>
                </p>
              </div>
            </Card.Body>
          </Card>

          <Alert variant="info" className="mt-3">
            <small>
              <strong>Security Note:</strong> For security reasons, we don't reveal whether an 
              account exists for the email you entered. If you don't receive an email, the account 
              may not exist, or you may have used a different email address.
            </small>
          </Alert>
        </div>
      </div>
    </Container>
  );
}

export default ForgotPassword;