/**
 * File: Home.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Home page component.
 * Landing page for the application.
 * Shows different content based on authentication status.
 */
const Home = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Container className="main-container">
      {isAuthenticated() ? (
        // Authenticated user view
        <div className="text-center">
          <h1 className="mb-4">Welcome to WhereIsIt?</h1>
          <p className="lead mb-4">
            Your receipts and warranties are safely stored and organized.
          </p>
          <Button as={Link} to="/dashboard" variant="primary" size="lg">
            Go to Dashboard
          </Button>
        </div>
      ) : (
        // Public landing page
        <>
          <div className="text-center mb-5">
            <h1 className="display-4 mb-3">WhereIsIt?</h1>
            <p className="lead">
              Never lose a receipt or miss a warranty claim again.
            </p>
            <p>
              Securely store, manage, and track all your receipts and warranty information in one
              place.
            </p>
            <div className="mt-4">
              <Button as={Link} to="/register" variant="primary" size="lg" className="me-3">
                Get Started
              </Button>
              <Button as={Link} to="/login" variant="outline-primary" size="lg">
                Login
              </Button>
            </div>
          </div>

          <Row className="mt-5">
            <Col md={4}>
              <Card className="h-100 text-center">
                <Card.Body>
                  <div className="mb-3" style={{ fontSize: '3rem' }}>
                    📄
                  </div>
                  <Card.Title>Smart Receipt Storage</Card.Title>
                  <Card.Text>
                    Upload photos of your receipts and let our OCR technology automatically extract
                    all the important details.
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="h-100 text-center">
                <Card.Body>
                  <div className="mb-3" style={{ fontSize: '3rem' }}>
                    🔒
                  </div>
                  <Card.Title>Bank-Level Security</Card.Title>
                  <Card.Text>
                    Your data is protected with AES-256 encryption, multi-factor authentication,
                    and industry-standard security practices.
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="h-100 text-center">
                <Card.Body>
                  <div className="mb-3" style={{ fontSize: '3rem' }}>
                    ⏰
                  </div>
                  <Card.Title>Warranty Tracking</Card.Title>
                  <Card.Text>
                    Keep track of warranty expiration dates and never miss an opportunity to claim
                    coverage on your purchases.
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Row className="mt-5">
            <Col md={12}>
              <Card className="bg-light">
                <Card.Body>
                  <h4 className="mb-3">How It Works</h4>
                  <Row>
                    <Col md={3}>
                      <h5>1. Sign Up</h5>
                      <p>Create your free account in seconds.</p>
                    </Col>
                    <Col md={3}>
                      <h5>2. Upload</h5>
                      <p>Scan or upload photos of your receipts.</p>
                    </Col>
                    <Col md={3}>
                      <h5>3. Automatic Extraction</h5>
                      <p>Our system extracts key details automatically.</p>
                    </Col>
                    <Col md={3}>
                      <h5>4. Track & Manage</h5>
                      <p>View your receipts and warranty status anytime.</p>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <div className="text-center mt-5">
            <h4>Ready to get organized?</h4>
            <Button as={Link} to="/register" variant="primary" size="lg" className="mt-3">
              Create Free Account
            </Button>
          </div>
        </>
      )}
    </Container>
  );
};

export default Home;