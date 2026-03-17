/**
 * File: ReceiptList.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Card, Table, Badge, Button, Alert, Spinner, InputGroup, Form } from 'react-bootstrap';
import { listReceipts } from '../services/api';

/**
 * ReceiptList Page
 * Displays all receipts for the authenticated user.
 * Shows warranty status and allows filtering/searching.
 * 
 * FEATURES:
 * - Lists all receipts with decrypted data
 * - Shows warranty expiry status (active, expiring soon, expired)
 * - Search/filter functionality
 * - Responsive table design
 * 
 * SECURITY:
 * - Data is decrypted server-side before transmission
 * - Only shows receipts owned by authenticated user (enforced by backend)
 * - XSS protection through React's automatic escaping
 */
function ReceiptList() {
  const navigate = useNavigate();

  const [receipts, setReceipts] = useState([]);
  const [filteredReceipts, setFilteredReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  /**
   * Fetches receipts from backend when component mounts.
   */
  useEffect(() => {
    fetchReceipts();
  }, []);

  /**
   * Fetches all receipts for the authenticated user.
   */
  const fetchReceipts = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await listReceipts();
      setReceipts(response.data.receipts || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Applies search and filter whenever receipts, searchTerm, or filterStatus change.
   */
  useEffect(() => {
    let filtered = [...receipts];

    // Apply search filter across store name and product description
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (receipt) =>
          receipt.storeName.toLowerCase().includes(term) ||
          receipt.productDescription.toLowerCase().includes(term)
      );
    }

    // Apply warranty status filter
    // Uses receipt.warrantyExpiry (correct field name from backend)
    if (filterStatus !== 'all') {
      filtered = filtered.filter((receipt) => {
        const status = getWarrantyStatus(receipt.warrantyExpiry);
        return status.toLowerCase() === filterStatus;
      });
    }

    setFilteredReceipts(filtered);
  }, [receipts, searchTerm, filterStatus]);

  /**
   * Determines warranty status based on expiry date.
   * @param {string} expiryDate - Warranty expiry date (YYYY-MM-DD)
   * @returns {string} Status: 'Active', 'Expiring Soon', or 'Expired'
   */
  const getWarrantyStatus = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return 'Expired';
    } else if (daysUntilExpiry <= 30) {
      return 'Expiring Soon';
    } else {
      return 'Active';
    }
  };

  /**
   * Returns the Bootstrap Badge variant for a given warranty status.
   * @param {string} status - Warranty status string
   * @returns {string} Bootstrap variant name
   */
  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'Active':       return 'success';
      case 'Expiring Soon': return 'warning';
      case 'Expired':      return 'danger';
      default:             return 'secondary';
    }
  };

  /**
   * Formats a date string for human-readable display.
   * @param {string} dateString - Date in YYYY-MM-DD format
   * @returns {string} Formatted date e.g. "2 Feb 2026"
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
   * Formats a number as a Euro currency string.
   * @param {number} amount - Amount to format
   * @returns {string} Formatted currency e.g. "€49.99"
   */
  const formatCurrency = (amount) => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed)) return '€0.00';
    return `€${parsed.toFixed(2)}`;
  };

  return (
    <Container className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>My Receipts</h2>
        <div>
          <Button
            variant="primary"
            className="me-2"
            onClick={() => navigate('/receipt/upload')}
          >
            <i className="bi bi-upload me-2"></i>
            Upload Receipt
          </Button>
          <Button
            variant="outline-primary"
            onClick={() => navigate('/receipt/manual')}
          >
            <i className="bi bi-plus-circle me-2"></i>
            Add Manually
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError('')} dismissible>
          {error}
        </Alert>
      )}

      {/* Search and Filter Controls */}
      <Card className="mb-4">
        <Card.Body>
          <div className="row g-3">
            <div className="col-md-8">
              <InputGroup>
                <InputGroup.Text>
                  <i className="bi bi-search"></i>
                </InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search by store or product..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <Button
                    variant="outline-secondary"
                    onClick={() => setSearchTerm('')}
                  >
                    Clear
                  </Button>
                )}
              </InputGroup>
            </div>
            <div className="col-md-4">
              <Form.Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Warranties</option>
                <option value="active">Active</option>
                <option value="expiring soon">Expiring Soon</option>
                <option value="expired">Expired</option>
              </Form.Select>
            </div>
          </div>
        </Card.Body>
      </Card>

      {loading ? (
        <div className="text-center my-5">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3">Loading receipts...</p>
        </div>
      ) : filteredReceipts.length === 0 ? (
        <Card>
          <Card.Body className="text-center py-5">
            <i className="bi bi-receipt display-1 text-muted"></i>
            <h4 className="mt-3">
              {receipts.length === 0 ? 'No receipts yet' : 'No matching receipts'}
            </h4>
            <p className="text-muted">
              {receipts.length === 0
                ? 'Upload your first receipt to get started!'
                : 'Try adjusting your search or filter criteria'}
            </p>
            {receipts.length === 0 && (
              <div className="mt-3">
                <Button
                  variant="primary"
                  className="me-2"
                  onClick={() => navigate('/receipt/upload')}
                >
                  Upload Receipt
                </Button>
                <Button
                  variant="outline-primary"
                  onClick={() => navigate('/receipt/manual')}
                >
                  Add Manually
                </Button>
              </div>
            )}
          </Card.Body>
        </Card>
      ) : (
        <Card>
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Store</th>
                    <th>Product</th>
                    <th>Purchase Date</th>
                    <th>Price</th>
                    <th>Warranty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.map((receipt) => {
                    // Use warrantyExpiry (correct backend field name)
                    const status = getWarrantyStatus(receipt.warrantyExpiry);
                    return (
                      <tr
                        key={receipt.id}
                        onClick={() => navigate(`/receipts/${receipt.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <strong>{receipt.storeName}</strong>
                        </td>
                        <td>{receipt.productDescription}</td>
                        <td>{formatDate(receipt.purchaseDate)}</td>
                        <td>{formatCurrency(receipt.price)}</td>
                        <td>
                          <div>{receipt.warrantyMonths} months</div>
                          <small className="text-muted">
                            {/* Use warrantyExpiry (correct backend field name) */}
                            Expires: {formatDate(receipt.warrantyExpiry)}
                          </small>
                        </td>
                        <td>
                          <Badge bg={getStatusBadgeVariant(status)}>
                            {status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Card.Body>
          <Card.Footer className="text-muted">
            Showing {filteredReceipts.length} of {receipts.length} receipt(s)
          </Card.Footer>
        </Card>
      )}
    </Container>
  );
}

export default ReceiptList;