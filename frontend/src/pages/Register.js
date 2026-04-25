/**
 * File: Register.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, ProgressBar } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../services/api';

/**
 * Registration page component.
 * Allows new users to create an account with their name, email, and password.
 *
 * SECURITY NOTES:
 * - Password requirements: min 12 chars, uppercase, lowercase, number, special character
 * - Live password strength indicator gives feedback as the user types
 * - Password confirmation to prevent typos
 * - ToS and Privacy Policy acceptance is required before the account can be created
 * - After registration, the user is redirected to login with a message to check their email
 */
const Register = () => {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTos, setAcceptedTos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  /**
   * Evaluates the password against all strength requirements.
   * Returns a score (0-5) and a list of unmet requirements.
   *
   * @param {string} pwd
   * @returns {{ score: number, unmet: string[] }}
   */
  const evaluatePassword = (pwd) => {
    const checks = [
      { test: pwd.length >= 12,         label: 'At least 12 characters' },
      { test: /[A-Z]/.test(pwd),        label: 'One uppercase letter' },
      { test: /[a-z]/.test(pwd),        label: 'One lowercase letter' },
      { test: /[0-9]/.test(pwd),        label: 'One number' },
      { test: /[^A-Za-z0-9]/.test(pwd), label: 'One special character (e.g. !@#$)' }
    ];
    return {
      score: checks.filter(c => c.test).length,
      unmet: checks.filter(c => !c.test).map(c => c.label)
    };
  };

  /**
   * Returns Bootstrap colour variant and label for the strength progress bar.
   * @param {number} score 0-5
   */
  const getStrengthDisplay = (score) => {
    if (score <= 1) return { variant: 'danger',  label: 'Very weak' };
    if (score === 2) return { variant: 'warning', label: 'Weak' };
    if (score === 3) return { variant: 'info',    label: 'Fair' };
    if (score === 4) return { variant: 'primary', label: 'Good' };
    return              { variant: 'success', label: 'Strong' };
  };

  const passwordEval = evaluatePassword(password);
  const strengthDisplay = getStrengthDisplay(passwordEval.score);

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  /**
   * Handles registration form submission.
   * On success, shows a message asking the user to verify their email before logging in.
   */
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (passwordEval.score < 5) {
      setError(`Password does not meet all requirements: ${passwordEval.unmet.join(', ')}`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!acceptedTos) {
      setError('You must accept the Terms of Service and Privacy Policy to create an account');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, 'FREE', firstName, lastName);
      setSuccess(true);
    } catch (err) {
      if (err.response?.status === 400) {
        const zodErrors = err.response.data?.issues;
        if (zodErrors?.length > 0) {
          setError(zodErrors.map(i => i.message).join('. '));
        } else {
          setError('Invalid registration data. Please check your inputs.');
        }
      } else if (err.response?.status === 409) {
        setError('An account with this email already exists.');
      } else {
        setError('Registration failed. Please try again later.');
      }
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="main-container">
      <Row className="justify-content-center">
        <Col md={7} lg={6}>
          <Card>
            <Card.Body>
              <h2 className="text-center mb-4">Register for WhereIsIt?</h2>

              {error && (
                <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>
              )}

              {/* Success state — don't redirect, show email check message */}
              {success ? (
                <Alert variant="success">
                  <h5 className="mb-2">Account created!</h5>
                  <p className="mb-2">
                    We've sent a verification email to <strong>{email}</strong>.
                    Please click the link in that email before logging in.
                  </p>
                  <p className="mb-0 text-muted" style={{ fontSize: '0.9rem' }}>
                    During development, check the backend console for the Ethereal preview URL.
                  </p>
                  <Button variant="primary" className="mt-3 w-100" onClick={() => navigate('/login')}>
                    Go to Login
                  </Button>
                </Alert>
              ) : (
                <Form noValidate onSubmit={handleRegister}>

                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>First Name</Form.Label>
                        <Form.Control type="text" placeholder="First name" value={firstName}
                          onChange={(e) => setFirstName(e.target.value)} disabled={loading} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Last Name</Form.Label>
                        <Form.Control type="text" placeholder="Last name" value={lastName}
                          onChange={(e) => setLastName(e.target.value)} disabled={loading} />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-3">
                    <Form.Label>Email address</Form.Label>
                    <Form.Control type="email" placeholder="Enter email" value={email}
                      onChange={(e) => setEmail(e.target.value)} disabled={loading} />
                  </Form.Group>

                  <Form.Group className="mb-1">
                    <Form.Label>Password</Form.Label>
                    <Form.Control type="password" placeholder="Password" value={password}
                      onChange={(e) => setPassword(e.target.value)} disabled={loading} />
                  </Form.Group>

                  {/* Live password strength indicator */}
                  {password && (
                    <div className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <small className="text-muted">Password strength</small>
                        <small className={`text-${strengthDisplay.variant} fw-semibold`}>
                          {strengthDisplay.label}
                        </small>
                      </div>
                      <ProgressBar
                        now={(passwordEval.score / 5) * 100}
                        variant={strengthDisplay.variant}
                        style={{ height: '6px' }}
                      />
                      {passwordEval.unmet.length > 0 && (
                        <ul className="mt-1 mb-0 ps-3" style={{ fontSize: '0.8rem' }}>
                          {passwordEval.unmet.map((req, i) => (
                            <li key={i} className="text-danger">{req}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {!password && (
                    <Form.Text className="text-muted d-block mb-3">
                      Must be at least 12 characters with uppercase, lowercase, number, and special character.
                    </Form.Text>
                  )}

                  <Form.Group className="mb-4">
                    <Form.Label>Confirm Password</Form.Label>
                    <Form.Control type="password" placeholder="Confirm password" value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} />
                    {confirmPassword && password && (
                      <Form.Text className={confirmPassword === password ? 'text-success' : 'text-danger'}>
                        {confirmPassword === password ? '✓ Passwords match' : '✗ Passwords do not match'}
                      </Form.Text>
                    )}
                  </Form.Group>

                  {/* Terms of Service and Privacy Policy acceptance */}
                  <Form.Group className="mb-4">
                    <Form.Check
                      type="checkbox"
                      id="acceptTos"
                      checked={acceptedTos}
                      onChange={(e) => setAcceptedTos(e.target.checked)}
                      disabled={loading}
                      label={
                        <span>
                          I have read and agree to the{' '}
                          <a href="/terms" target="_blank" rel="noopener noreferrer">
                            Terms of Service
                          </a>{' '}
                          and{' '}
                          <a href="/privacy" target="_blank" rel="noopener noreferrer">
                            Privacy Policy
                          </a>
                        </span>
                      }
                    />
                  </Form.Group>

                  <Button
                    variant="primary"
                    type="submit"
                    className="w-100"
                    disabled={loading || !acceptedTos}
                  >
                    {loading ? (
                      <>
                        <Spinner as="span" animation="border" size="sm" className="me-2" />
                        Creating account...
                      </>
                    ) : 'Create Account'}
                  </Button>
                </Form>
              )}

              {!success && (
                <>
                  <Alert variant="info" className="mt-3 mb-0">
                    <small>
                      After registering, check your email to verify your account.
                      Then set up <strong>two-factor authentication</strong> from your Profile page.
                    </small>
                  </Alert>
                  <div className="text-center mt-3">
                    <p>Already have an account? <Link to="/login">Login here</Link></p>
                  </div>
                </>
              )}

            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Register;