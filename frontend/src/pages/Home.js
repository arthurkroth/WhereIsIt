/**
 * File: Home.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import logoIcon from '../assets/logo-icon.svg';

// The four-step "how it works" strip shown beneath the feature cards.
const STEPS = [
  { title: 'Sign up', text: 'Create your free account in seconds.' },
  { title: 'Upload', text: 'Scan or photograph any receipt.' },
  { title: 'Auto-extract', text: 'OCR pulls out the key details for you.' },
  { title: 'Track', text: 'See warranty status anytime, anywhere.' }
];

// Public landing page shown to signed-out visitors at "/", with links to login/register.
function Home() {
  return (
    <>
      {/* Sticky, blurred top nav */}
      <nav className="landing-navbar">
        <Container className="landing-navbar-inner">
          <Link to="/" className="landing-nav-brand">
            <img src={logoIcon} alt="" />
            WhereIsIt?
          </Link>
          <div className="d-flex gap-2">
            <Button as={Link} to="/login" variant="outline-primary">Login</Button>
            <Button as={Link} to="/register" variant="primary">Get Started</Button>
          </div>
        </Container>
      </nav>

      <Container className="landing-content">
        <div className="landing-hero">
          <div className="landing-blob landing-blob--1" aria-hidden="true" />
          <div className="landing-blob landing-blob--2" aria-hidden="true" />

          <span className="landing-eyebrow fade-in-up">🔒 Secure receipt &amp; warranty management</span>

          <h1 className="display-4 fw-bold mb-3 fade-in-up" style={{ animationDelay: '0.08s' }}>
            Never lose a receipt or <span className="text-gradient">warranty</span> again.
          </h1>

          <p
            className="lead text-secondary mb-4 mx-auto fade-in-up"
            style={{ maxWidth: '620px', animationDelay: '0.16s' }}
          >
            WhereIsIt? securely stores, organises, and tracks every receipt and warranty
            you own - so you always know exactly where it is, and when it expires.
          </p>

          <div
            className="d-flex justify-content-center flex-wrap gap-3 fade-in-up"
            style={{ animationDelay: '0.24s' }}
          >
            <Button as={Link} to="/register" variant="primary" size="lg">
              Create free account
            </Button>
            <Button as={Link} to="/login" variant="outline-primary" size="lg">
              Login
            </Button>
          </div>

          <div className="landing-trust-row fade-in-up" style={{ animationDelay: '0.32s' }}>
            <span className="landing-trust-badge">🔐 AES-256 encrypted</span>
            <span className="landing-trust-badge">🤖 AI-powered OCR</span>
            <span className="landing-trust-badge">🆓 Free forever plan</span>
          </div>
        </div>

        <Row className="g-4 mb-5">
          <Col md={4}>
            <Card className="h-100 text-center landing-feature-card">
              <Card.Body className="py-4">
                <div className="landing-feature-icon">📄</div>
                <Card.Title>Smart Receipt Storage</Card.Title>
                <Card.Text className="text-secondary">
                  Upload a photo of any receipt and let OCR automatically extract the
                  store, items, prices, and dates for you.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="h-100 text-center landing-feature-card">
              <Card.Body className="py-4">
                <div className="landing-feature-icon">🔒</div>
                <Card.Title>Bank-Level Security</Card.Title>
                <Card.Text className="text-secondary">
                  Sensitive data is encrypted at rest, passwords are hashed with bcrypt,
                  and two-factor authentication keeps your account locked down.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="h-100 text-center landing-feature-card">
              <Card.Body className="py-4">
                <div className="landing-feature-icon">⏰</div>
                <Card.Title>Warranty Tracking</Card.Title>
                <Card.Text className="text-secondary">
                  We keep an eye on every warranty expiry date so you never miss a
                  chance to claim a repair or replacement.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* How it works */}
        <Row className="g-4 mb-5 text-center">
          {STEPS.map((step, i) => (
            <Col key={step.title} xs={6} md={3}>
              <div className="landing-step-number">{i + 1}</div>
              <h6 className="fw-bold mb-1">{step.title}</h6>
              <p className="text-secondary small mb-0">{step.text}</p>
            </Col>
          ))}
        </Row>

        <div className="landing-cta text-center mb-5">
          <h3 className="fw-bold mb-2">Ready to get organised?</h3>
          <p className="mb-4" style={{ opacity: 0.85 }}>
            It takes less than a minute to create your free account.
          </p>
          <Button as={Link} to="/register" variant="success" size="lg">
            Get Started - It's Free
          </Button>
        </div>

        <footer className="landing-footer">
          <p className="mb-2">
            <Link to="/terms">Terms of Service</Link> · <Link to="/privacy">Privacy Policy</Link>
          </p>
          <p className="mb-0">© {new Date().getFullYear()} WhereIsIt? - All rights reserved.</p>
        </footer>
      </Container>
    </>
  );
}

export default Home;
