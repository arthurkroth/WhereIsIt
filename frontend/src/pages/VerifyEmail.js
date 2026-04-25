/**
 * File: VerifyEmail.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Container, Row, Col, Card, Alert, Spinner, Button } from 'react-bootstrap';
import { verifyEmail } from '../services/api';

/**
 * VerifyEmail Page
 * Handles the email verification link clicked by the user from their inbox.
 *
 * Flow:
 * 1. User registers → verification email sent → console shows Ethereal preview URL
 * 2. User opens the email and clicks "Verify Email Address"
 * 3. Browser navigates to /verify-email?token=...
 * 4. This page reads the token from the URL and calls the backend once
 * 5. On success, shows a confirmation and redirects to login after 3 seconds
 * 6. On failure (expired/invalid), shows an error with a back to login option
 *
 * IMPORTANT — React StrictMode double-invocation guard:
 * In development, React 18 StrictMode intentionally mounts components twice
 * to detect side effects. Without a guard, the verify API call would fire twice:
 * - First call succeeds and clears the token from the database
 * - Second call finds no token and returns "expired"
 * The `hasVerified` ref ensures the API call is made exactly once per mount.
 */
function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState('verifying'); // verifying | success | already_verified | error | expired
  const [message, setMessage] = useState('');

  /**
   * Ref flag to prevent the effect from running more than once.
   * useRef persists across StrictMode's double-invocation without triggering a re-render.
   */
  const hasVerified = useRef(false);

  useEffect(() => {
    // Guard: if this effect has already run once, do nothing on the second invocation
    if (hasVerified.current) return;
    hasVerified.current = true;

    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('No verification token found. Please use the link from your email.');
      return;
    }

    /**
     * Sends the token to the backend for verification.
     * Called exactly once when the page loads with a valid token in the URL.
     */
    const doVerify = async () => {
      try {
        const response = await verifyEmail(token);

        // Check if it was freshly verified or already verified previously
        if (response.data.alreadyVerified) {
          setStatus('already_verified');
        } else {
          setStatus('success');
        }
        setMessage(response.data.message || 'Email verified successfully.');

        // Redirect to login after 3 seconds on any success state
        setTimeout(() => navigate('/login'), 3000);

      } catch (err) {
        const data = err.response?.data;
        if (data?.expired) {
          setStatus('expired');
        } else {
          setStatus('error');
        }
        setMessage(data?.error || 'Verification failed. Please try again.');
      }
    };

    doVerify();
  }, []);

  return (
    <Container className="main-container">
      <Row className="justify-content-center">
        <Col md={6} lg={5}>
          <Card>
            <Card.Body className="text-center py-5">

              {/* Verifying — spinner */}
              {status === 'verifying' && (
                <>
                  <Spinner animation="border" variant="primary" className="mb-3" />
                  <h5>Verifying your email address...</h5>
                  <p className="text-muted">Please wait a moment.</p>
                </>
              )}

              {/* Freshly verified */}
              {status === 'success' && (
                <>
                  <div className="text-success mb-3" style={{ fontSize: '4rem' }}>✓</div>
                  <h4 className="text-success mb-3">Email Verified!</h4>
                  <Alert variant="success">{message}</Alert>
                  <p className="text-muted">Redirecting to login in 3 seconds...</p>
                  <Button variant="primary" onClick={() => navigate('/login')}>
                    Go to Login
                  </Button>
                </>
              )}

              {/* Already verified previously */}
              {status === 'already_verified' && (
                <>
                  <div className="text-success mb-3" style={{ fontSize: '4rem' }}>✓</div>
                  <h4 className="text-success mb-3">Already Verified</h4>
                  <Alert variant="info">
                    Your email address has already been verified. You can log in now.
                  </Alert>
                  <p className="text-muted">Redirecting to login in 3 seconds...</p>
                  <Button variant="primary" onClick={() => navigate('/login')}>
                    Go to Login
                  </Button>
                </>
              )}

              {/* Expired token */}
              {status === 'expired' && (
                <>
                  <div className="text-warning mb-3" style={{ fontSize: '4rem' }}>⚠</div>
                  <h4 className="text-warning mb-3">Link Expired</h4>
                  <Alert variant="warning">{message}</Alert>
                  <p className="text-muted mb-4">
                    Verification links are valid for 24 hours. Request a new one from the login page.
                  </p>
                  <Link to="/login" className="btn btn-primary">
                    Back to Login
                  </Link>
                </>
              )}

              {/* Generic error */}
              {status === 'error' && (
                <>
                  <div className="text-danger mb-3" style={{ fontSize: '4rem' }}>✗</div>
                  <h4 className="text-danger mb-3">Verification Failed</h4>
                  <Alert variant="danger">{message}</Alert>
                  <Link to="/login" className="btn btn-primary">
                    Back to Login
                  </Link>
                </>
              )}

            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default VerifyEmail;