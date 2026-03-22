/**
 * File: ResetPassword.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { Container, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/api';

/**
 * ResetPassword Page
 * Allows users to set a new password using a valid reset token.
 * 
 * SECURITY FEATURES:
 * - Token validated on backend
 * - Token expires after 1 hour
 * - Token is single-use (invalidated after successful reset)
 * - Password must meet strength requirements (min 10 chars)
 * - Confirmation field prevents typos
 * 
 * WORKFLOW:
 * 1. User arrives via email link with token in URL
 * 2. User enters new password (and confirms)
 * 3. Backend validates token and updates password
 * 4. User redirected to login with success message
 */
function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  /**
   * Extract token from URL on component mount.
   */
  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      setToken(urlToken);
    } else {
      setError('No reset token provided. Please use the link from your email.');
    }
  }, [searchParams]);

  /**
   * Validates password strength.
   * @param {string} password - Password to validate
   * @returns {object} Validation result {valid: boolean, error: string}
   */
  const validatePassword = (password) => {
    if (password.length < 10) {
      return { valid: false, error: 'Password must be at least 10 characters long' };
    }
    return { valid: true, error: null };
  };

  /**
   * Handles form submission to reset password.
   * @param {Event} e - Form submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate token
    if (!token) {
      setError('No reset token provided');
      return;
    }

    // Validate password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      setError(passwordValidation.error);
      return;
    }

    // Check passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await resetPassword(token, newPassword);
      
      setSuccess(true);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login', { 
          state: { message: 'Password reset successful! Please login with your new password.' }
        });
      }, 3000);
      
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.message || 
                          'Failed to reset password. The link may be expired or invalid.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Calculates password strength indicator.
   * @param {string} password - Password to check
   * @returns {object} Strength info {level: string, variant: string, text: string}
   */
  const getPasswordStrength = (password) => {
    if (password.length === 0) {
      return { level: 0, variant: 'secondary', text: '' };
    }
    if (password.length < 10) {
      return { level: 25, variant: 'danger', text: 'Too short' };
    }
    if (password.length < 12) {
      return { level: 50, variant: 'warning', text: 'Fair' };
    }
    if (password.length < 16) {
      return { level: 75, variant: 'info', text: 'Good' };
    }
    return { level: 100, variant: 'success', text: 'Strong' };
  };

  const strength = getPasswordStrength(newPassword);

  return (
    <Container className="mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <Card>
            <Card.Header className="bg-primary text-white">
              <h4 className="mb-0">Reset Password</h4>
            </Card.Header>
            <Card.Body>
              {error && (
                <Alert variant="danger" className="mb-3">
                  {error}
                </Alert>
              )}

              {success ? (
                <Alert variant="success">
                  <strong>Success!</strong>
                  <p className="mb-0 mt-2">
                    Your password has been reset. Redirecting to login page...
                  </p>
                  <div className="text-center mt-3">
                    <Spinner animation="border" size="sm" />
                  </div>
                </Alert>
              ) : (
                <>
                  <p className="text-muted mb-4">
                    Enter your new password below. Make sure it's at least 10 characters long.
                  </p>

                  <Form onSubmit={handleSubmit}>
                    {/* Hidden token field for manual entry (if needed) */}
                    <Form.Group className="mb-3">
                      <Form.Label>Reset Token</Form.Label>
                      <Form.Control
                        type="text"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        disabled={!!searchParams.get('token') || loading}
                        placeholder="Automatically filled from URL"
                        readOnly={!!searchParams.get('token')}
                      />
                      <Form.Text className="text-muted">
                        This is automatically filled from your reset link.
                      </Form.Text>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>New Password</Form.Label>
                      <Form.Control
                        type="password"
                        placeholder="Enter new password (min 10 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={loading}
                        required
                        minLength={10}
                      />
                      
                      {newPassword && (
                        <div className="mt-2">
                          <div className="progress" style={{ height: '5px' }}>
                            <div 
                              className={`progress-bar bg-${strength.variant}`}
                              style={{ width: `${strength.level}%` }}
                            />
                          </div>
                          <Form.Text className={`text-${strength.variant}`}>
                            {strength.text}
                          </Form.Text>
                        </div>
                      )}
                    </Form.Group>

                    <Form.Group className="mb-4">
                      <Form.Label>Confirm New Password</Form.Label>
                      <Form.Control
                        type="password"
                        placeholder="Re-enter new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={loading}
                        required
                        isInvalid={confirmPassword && newPassword !== confirmPassword}
                      />
                      <Form.Control.Feedback type="invalid">
                        Passwords do not match
                      </Form.Control.Feedback>
                    </Form.Group>

                    <div className="d-grid gap-2">
                      <Button 
                        variant="primary" 
                        type="submit" 
                        disabled={loading || !token || !newPassword || !confirmPassword}
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
                            Resetting Password...
                          </>
                        ) : (
                          'Reset Password'
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
              </div>
            </Card.Body>
          </Card>

          <Alert variant="info" className="mt-3">
            <small>
              <strong>Security Tips:</strong>
              <ul className="mb-0 mt-2">
                <li>Use a strong, unique password</li>
                <li>Don't reuse passwords from other sites</li>
                <li>Consider using a password manager</li>
                <li>Reset tokens expire after 1 hour</li>
              </ul>
            </small>
          </Alert>
        </div>
      </div>
    </Container>
  );
}

export default ResetPassword;