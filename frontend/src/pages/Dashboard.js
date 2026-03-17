/**
 * File: Dashboard.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Alert, Spinner, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listReceipts } from '../services/api';

/**
 * Dashboard page component.
 * Shows user overview and recent receipts with warranty status.
 *
 * FEATURES:
 * - Welcome message with user info
 * - Summary statistics (total receipts, active/expired warranties, total value)
 * - Recent receipts with warranty status
 * - Quick action buttons
 */
const Dashboard = () => {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /**
   * Fetches user receipts on component mount.
   */
  useEffect(() => {
    fetchReceipts();
  }, []);

  /**
   * Fetches all receipts for the current user from the backend.
   */
  const fetchReceipts = async () => {
    try {
      const response = await listReceipts();
      setReceipts(response.data.receipts || []);
    } catch (err) {
      setError('Failed to load receipts');
      console.error('Error fetching receipts:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Calculates warranty status for a receipt.
   * Uses receipt.warrantyExpiry (correct backend field name).
   *
   * @param {string} warrantyExpiry - Expiry date (YYYY-MM-DD)
   * @returns {Object} Status object with Bootstrap variant and display text
   */
  const getWarrantyStatus = (warrantyExpiry) => {
    const today = new Date();
    const expiryDate = new Date(warrantyExpiry);
    const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { variant: 'danger', text: 'Expired' };
    } else if (daysUntilExpiry <= 30) {
      return { variant: 'warning', text: `Expires in ${daysUntilExpiry} days` };
    } else {
      return { variant: 'success', text: 'Active' };
    }
  };

  /**
   * Formats a date string for display, handling invalid dates gracefully.
   *
   * @param {string} dateString - Date string to format
   * @returns {string} Formatted date or 'N/A'
   */
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  /**
   * Calculates summary statistics from the receipts list.
   * Uses receipt.warrantyExpiry and receipt.price (correct backend field names).
   *
   * @returns {Object} Stats object with total, active, expired, totalValue
   */
  const getStatistics = () => {
    const total = receipts.length;

    // Count receipts where the warranty expiry is in the future
    const active = receipts.filter((r) => {
      const expiryDate = new Date(r.warrantyExpiry);
      return expiryDate > new Date();
    }).length;

    const expired = total - active;

    // Sum up all receipt prices - use receipt.price (correct backend field name)
    const totalValue = receipts.reduce((sum, r) => {
      const price = parseFloat(r.price);
      return sum + (isNaN(price) ? 0 : price);
    }, 0);

    return { total, active, expired, totalValue };
  };

  const stats = getStatistics();

  if (loading) {
    return (
      <Container className="main-container">
        <div className="spinner-container">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      </Container>
    );
  }

  return (
    <Container className="main-container">
      <h1 className="mb-4">Dashboard</h1>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Welcome Card */}
      <Card className="mb-4">
        <Card.Body>
          <h3>Welcome back!</h3>
          <p className="mb-0">
            User ID: <strong>{user?.userId}</strong> | Account Type: <strong>{user?.role}</strong>
          </p>
        </Card.Body>
      </Card>

      {/* Statistics Cards */}
      <Row className="mb-4">
        <Col md={3}>
          <Card className="text-center">
            <Card.Body>
              <h2>{stats.total}</h2>
              <p className="mb-0">Total Receipts</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center">
            <Card.Body>
              <h2 className="text-success">{stats.active}</h2>
              <p className="mb-0">Active Warranties</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center">
            <Card.Body>
              <h2 className="text-danger">{stats.expired}</h2>
              <p className="mb-0">Expired Warranties</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center">
            <Card.Body>
              <h2>€{stats.totalValue.toFixed(2)}</h2>
              <p className="mb-0">Total Value</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Quick Actions */}
      <Card className="mb-4">
        <Card.Body>
          <h5>Quick Actions</h5>
          <div className="d-flex gap-2">
            <Button as={Link} to="/receipt/upload" variant="primary">
              Upload Receipt
            </Button>
            <Button as={Link} to="/receipt/manual" variant="outline-primary">
              Add Manually
            </Button>
            <Button as={Link} to="/receipts" variant="secondary">
              View All Receipts
            </Button>
            <Button as={Link} to="/mfa-setup" variant="outline-secondary">
              Setup MFA
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Recent Receipts */}
      <h4 className="mb-3">Recent Receipts</h4>
      {receipts.length === 0 ? (
        <Alert variant="info">
          You haven't added any receipts yet.{' '}
          <Link to="/receipt/upload">Upload your first receipt</Link> to get started!
        </Alert>
      ) : (
        <Row>
          {receipts.slice(0, 6).map((receipt) => {
            // Use warrantyExpiry (correct backend field name)
            const warrantyStatus = getWarrantyStatus(receipt.warrantyExpiry);
            return (
              <Col md={6} lg={4} key={receipt.id}>
                <Card className="receipt-card mb-3">
                  <Card.Body>
                    <Card.Title>{receipt.productDescription}</Card.Title>
                    <Card.Subtitle className="mb-2 text-muted">
                      {receipt.storeName}
                    </Card.Subtitle>
                    <Card.Text>
                      <small>
                        <strong>Purchase Date:</strong> {formatDate(receipt.purchaseDate)}
                        <br />
                        {/* Use receipt.price (correct backend field name) */}
                        <strong>Price:</strong> €{parseFloat(receipt.price || 0).toFixed(2)}
                        <br />
                        <strong>Warranty:</strong> {receipt.warrantyMonths} months
                        <br />
                        {/* Use warrantyExpiry (correct backend field name) */}
                        <strong>Expires:</strong> {formatDate(receipt.warrantyExpiry)}
                      </small>
                    </Card.Text>
                    <Alert variant={warrantyStatus.variant} className="mb-0 py-1">
                      <small>{warrantyStatus.text}</small>
                    </Alert>
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {receipts.length > 6 && (
        <div className="text-center mt-3">
          <Button as={Link} to="/receipts" variant="outline-primary">
            View All {receipts.length} Receipts
          </Button>
        </div>
      )}
    </Container>
  );
};

export default Dashboard;