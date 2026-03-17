/**
 * File: Register.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../services/api';

/**
 * Registration page component.
 * Allows new users to create an account.
 * 
 * SECURITY NOTES:
 * - Password requirements enforced (min 10 characters)
 * - Password confirmation to prevent typos
 * - Passwords never logged or displayed
 * - Client-side validation before API call
 * - Generic error messages to prevent information leakage
 */
const Register = () => {
  const navigate = useNavigate();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [plan, setPlan] = useState('FREE');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
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
   * Validates password strength.
   * Current requirement: minimum 10 characters
   * Can be extended with additional complexity requirements.
   * @param {string} password - Password to validate
   * @returns {Object} Validation result
   */
  const validatePassword = (password) => {
    const errors = [];

    if (password.length < 10) {
      errors.push('Password must be at least 10 characters long');
    }

    // Optional: Add more complexity requirements
    // if (!/[A-Z]/.test(password)) {
    //   errors.push('Password must contain at least one uppercase letter');
    // }
    // if (!/[0-9]/.test(password)) {
    //   errors.push('Password must contain at least one number');
    // }

    return {
      valid: errors.length === 0,
      errors,
    };
  };

  /**
   * Handles registration form submission.
   */
  const handleRegister = async (e) => {
    e.preventDefault();
    setValidated(true);
    setError('');

    // Client-side validation
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.errors.join('. '));
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, plan);
      
      // Registration successful
      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      // Handle specific errors
      if (err.response?.status === 400) {
        setError('Invalid registration data. Please check your inputs.');
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
        <Col md={6} lg={5}>
          <Card>
            <Card.Body>
              <h2 className="text-center mb-4">Register for WhereIsIt?</h2>

              {error && (
                <Alert variant="danger" dismissible onClose={() => setError('')}>
                  {error}
                </Alert>
              )}

              {success && (
                <Alert variant="success">
                  Registration successful! Redirecting to login...
                </Alert>
              )}

              <Form noValidate validated={validated} onSubmit={handleRegister}>
                <Form.Group className="mb-3" controlId="formEmail">
                  <Form.Label>Email address</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="Enter email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading || success}
                  />
                  <Form.Text className="text-muted">
                    We'll never share your email with anyone else.
                  </Form.Text>
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
                    disabled={loading || success}
                  />
                  <Form.Text className="text-muted">
                    Must be at least 10 characters long.
                  </Form.Text>
                  <Form.Control.Feedback type="invalid">
                    Password must be at least 10 characters.
                  </Form.Control.Feedback>
                </Form.Group>

                <Form.Group className="mb-3" controlId="formConfirmPassword">
                  <Form.Label>Confirm Password</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading || success}
                  />
                  <Form.Control.Feedback type="invalid">
                    Please confirm your password.
                  </Form.Control.Feedback>
                </Form.Group>

                <Form.Group className="mb-3" controlId="formPlan">
                  <Form.Label>Account Plan</Form.Label>
                  <Form.Select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    disabled={loading || success}
                  >
                    <option value="FREE">Free</option>
                    <option value="PREMIUM">Premium</option>
                  </Form.Select>
                  <Form.Text className="text-muted">
                    You can upgrade later if needed.
                  </Form.Text>
                </Form.Group>

                <Button
                  variant="primary"
                  type="submit"
                  className="w-100"
                  disabled={loading || success}
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
                      Registering...
                    </>
                  ) : (
                    'Register'
                  )}
                </Button>
              </Form>

              <div className="text-center mt-3">
                <p>
                  Already have an account? <Link to="/login">Login here</Link>
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Register;