/**
 * File: Dashboard.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container, Row, Col, Card, Badge, Button,
  Alert, Spinner, ProgressBar
} from 'react-bootstrap';
import { listReceipts } from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * Dashboard Page
 * Shows an overview of the user's receipts, warranty status, and storage usage.
 *
 * SECTIONS:
 * - Storage usage bar (FREE tier only) with upgrade prompt when approaching limit
 * - Warranty alerts: receipts expiring within 30 days
 * - Summary stats: total receipts, active warranties, expiring soon, expired
 * - Recent receipts: last 5 receipts as clickable cards
 */
function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [receipts, setReceipts] = useState([]);
  const [storageInfo, setStorageInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchReceipts(); }, []);

  /**
   * Fetches all receipts and storage info from the backend.
   */
  const fetchReceipts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listReceipts();
      setReceipts(response.data.receipts || []);
      setStorageInfo(response.data.storageInfo || null);
    } catch (err) {
      setError('Failed to load dashboard data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Determines the warranty status of a receipt based on its expiry date.
   * @param {string} expiryDate - ISO date string
   * @returns {string} 'Active' | 'Expiring Soon' | 'Expired'
   */
  const getWarrantyStatus = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'Expired';
    if (daysLeft <= 30) return 'Expiring Soon';
    return 'Active';
  };

  /**
   * Returns the number of days remaining until warranty expiry.
   * Negative value means already expired.
   * @param {string} expiryDate
   * @returns {number}
   */
  const getDaysLeft = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  };

  const getStatusBadgeVariant = (status) => {
    if (status === 'Active') return 'success';
    if (status === 'Expiring Soon') return 'warning';
    if (status === 'Expired') return 'danger';
    return 'secondary';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatCurrency = (amount) => {
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? '€0.00' : `€${parsed.toFixed(2)}`;
  };

  // Compute summary stats
  const activeCount = receipts.filter(r => getWarrantyStatus(r.warrantyExpiry) === 'Active').length;
  const expiringSoonCount = receipts.filter(r => getWarrantyStatus(r.warrantyExpiry) === 'Expiring Soon').length;
  const expiredCount = receipts.filter(r => getWarrantyStatus(r.warrantyExpiry) === 'Expired').length;

  // Receipts expiring within 30 days (for the warning banner)
  const expiringReceipts = receipts.filter(r => {
    const days = getDaysLeft(r.warrantyExpiry);
    return days >= 0 && days <= 30;
  });

  // Most recent 5 receipts
  const recentReceipts = [...receipts]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  // Storage bar colour: green → yellow → red as usage approaches limit
  const getStorageBarVariant = (used, limit) => {
    const pct = (used / limit) * 100;
    if (pct >= 90) return 'danger';
    if (pct >= 70) return 'warning';
    return 'success';
  };

  if (loading) {
    return (
      <Container className="mt-0 text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-muted">Loading dashboard...</p>
      </Container>
    );
  }

  const firstName = user?.firstName || 'there';

  return (
    <Container className="mt-0">

      {/* Page header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Welcome back, {firstName}!</h2>
        <div>
          <Button variant="primary" className="me-2" onClick={() => navigate('/receipt/upload')}>
            Upload Receipt
          </Button>
          <Button variant="outline-primary" onClick={() => navigate('/receipt/manual')}>
            Add Manually
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      {/* FREE tier storage usage bar */}
      {storageInfo?.isLimited && (
        <Card className="mb-4">
          <Card.Body>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="fw-semibold">Storage Usage</span>
              <span className="text-muted small">
                {storageInfo.used} / {storageInfo.limit} receipts
              </span>
            </div>
            <ProgressBar
              now={(storageInfo.used / storageInfo.limit) * 100}
              variant={getStorageBarVariant(storageInfo.used, storageInfo.limit)}
              style={{ height: '10px' }}
            />

            {/* Approaching limit: warn at 80% */}
            {storageInfo.used >= Math.floor(storageInfo.limit * 0.8) && storageInfo.used < storageInfo.limit && (
              <Alert variant="warning" className="mt-3 mb-0">
                You have used <strong>{storageInfo.used} of {storageInfo.limit}</strong> receipts.
                Upgrade to Premium for unlimited storage.
              </Alert>
            )}

            {/* At limit */}
            {storageInfo.used >= storageInfo.limit && (
              <Alert variant="danger" className="mt-3 mb-0">
                <strong>Storage limit reached.</strong> You cannot add more receipts on the Free tier.
                Delete old receipts or upgrade to Premium for unlimited storage.
              </Alert>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Warranty expiry warning banner */}
      {expiringReceipts.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <strong>⚠ Warranty Alert:</strong>{' '}
          {expiringReceipts.length === 1
            ? <>1 receipt (<strong>{expiringReceipts[0].storeName}</strong>) has a warranty expiring within 30 days.</>
            : <>{expiringReceipts.length} receipts have warranties expiring within 30 days.</>
          }
          {' '}<Link to="/receipts?filter=expiring">View expiring warranties →</Link>
        </Alert>
      )}

      {/* Summary stats row */}
      <Row className="mb-4 g-3">
        <Col xs={6} md={3}>
          <Card className="text-center h-100">
            <Card.Body>
              <div className="display-6 fw-bold text-primary">{receipts.length}</div>
              <div className="text-muted small mt-1">Total Receipts</div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="text-center h-100 border-success">
            <Card.Body>
              <div className="display-6 fw-bold text-success">{activeCount}</div>
              <div className="text-muted small mt-1">Active Warranties</div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="text-center h-100 border-warning">
            <Card.Body>
              <div className="display-6 fw-bold text-warning">{expiringSoonCount}</div>
              <div className="text-muted small mt-1">Expiring Soon</div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} md={3}>
          <Card className="text-center h-100 border-danger">
            <Card.Body>
              <div className="display-6 fw-bold text-danger">{expiredCount}</div>
              <div className="text-muted small mt-1">Expired</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Recent receipts */}
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <strong>Recent Receipts</strong>
          <Button variant="link" size="sm" onClick={() => navigate('/receipts')}>
            View All →
          </Button>
        </Card.Header>
        <Card.Body className="p-0">
          {receipts.length === 0 ? (
            <div className="text-center py-5">
              <p className="text-muted mb-3">No receipts yet. Add your first one!</p>
              <Button variant="primary" className="me-2" onClick={() => navigate('/receipt/upload')}>
                Upload Receipt
              </Button>
              <Button variant="outline-primary" onClick={() => navigate('/receipt/manual')}>
                Add Manually
              </Button>
            </div>
          ) : (
            <Row className="g-3 p-3">
              {recentReceipts.map(receipt => {
                const status = getWarrantyStatus(receipt.warrantyExpiry);
                const daysLeft = getDaysLeft(receipt.warrantyExpiry);
                return (
                  <Col key={receipt.id} xs={12} md={6} lg={4}>
                    <Card
                      className="h-100"
                      onClick={() => navigate(`/receipts/${receipt.id}`)}
                      style={{ cursor: 'pointer', transition: 'box-shadow 0.2s ease' }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                    >
                      <Card.Body>
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <Card.Title className="fs-6 mb-0 text-truncate me-2">{receipt.storeName}</Card.Title>
                        <Badge bg={getStatusBadgeVariant(status)} className="flex-shrink-0">
                          {status}
                        </Badge>
                      </div>

                      <Card.Subtitle className="mb-2 text-muted" style={{ fontSize: '0.82rem' }}>
                        {receipt.firstItemDescription || 'No items'}
                        {receipt.itemCount > 1 && ` +${receipt.itemCount - 1} more`}
                      </Card.Subtitle>

                        {/* Tags */}
                        {receipt.tags?.length > 0 && (
                          <div className="d-flex flex-wrap gap-1 mb-2">
                            {receipt.tags.map(tag => (
                              <span key={tag} className="badge rounded-pill bg-light text-dark border"
                                style={{ fontSize: '0.7rem' }}>{tag}</span>
                            ))}
                          </div>
                        )}

                        <div className="d-flex justify-content-between align-items-center mt-2">
                          <small className="text-muted">{formatDate(receipt.purchaseDate)}</small>
                          <strong>{formatCurrency(receipt.totalPrice)}</strong>
                        </div>

                        {/* Warranty expiry countdown */}
                        {status === 'Expiring Soon' && (
                          <div className="mt-2">
                            <small className="text-warning fw-semibold">
                              ⚠ Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                            </small>
                          </div>
                        )}
                        {status === 'Expired' && (
                          <div className="mt-2">
                            <small className="text-danger">Warranty expired {Math.abs(daysLeft)} day{Math.abs(daysLeft) !== 1 ? 's' : ''} ago</small>
                          </div>
                        )}
                      </Card.Body>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}
        </Card.Body>
      </Card>

    </Container>
  );
}

export default Dashboard;