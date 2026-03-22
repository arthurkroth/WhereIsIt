/**
 * File: Receipts.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import {
  Container,
  Row,
  Col,
  Card,
  Alert,
  Spinner,
  Form,
  InputGroup,
  Badge,
  Table,
} from 'react-bootstrap';
import { listReceipts } from '../services/api';

/**
 * Receipts list page component.
 * Displays all user receipts with search and filter capabilities.
 * 
 * Features:
 * - Search by product or store name
 * - Filter by warranty status
 * - Sort by date or price
 * - Responsive table view
 */
const Receipts = () => {
  const [receipts, setReceipts] = useState([]);
  const [filteredReceipts, setFilteredReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filter and search state
  const [searchTerm, setSearchTerm] = useState('');
  const [warrantyFilter, setWarrantyFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');

  /**
   * Fetches receipts on component mount.
   */
  useEffect(() => {
    fetchReceipts();
  }, []);

  /**
   * Fetches all receipts for the current user.
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
   * Determines if a warranty is active, expiring soon, or expired.
   * @param {string} warrantyExpiresOn - Expiry date (YYYY-MM-DD)
   * @returns {string} Status: 'active', 'expiring', or 'expired'
   */
  const getWarrantyCategory = (warrantyExpiresOn) => {
    const today = new Date();
    const expiryDate = new Date(warrantyExpiresOn);
    const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 30) return 'expiring';
    return 'active';
  };

  /**
   * Gets badge variant and text for warranty status.
   * @param {string} warrantyExpiresOn - Expiry date
   * @returns {Object} Badge configuration
   */
  const getWarrantyBadge = (warrantyExpiresOn) => {
    const today = new Date();
    const expiryDate = new Date(warrantyExpiresOn);
    const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { variant: 'danger', text: `Expired ${Math.abs(daysUntilExpiry)} days ago` };
    } else if (daysUntilExpiry <= 30) {
      return { variant: 'warning', text: `Expires in ${daysUntilExpiry} days` };
    } else {
      return { variant: 'success', text: `${daysUntilExpiry} days remaining` };
    }
  };

  /**
   * Applies filters and sorting when dependencies change.
   */
  useEffect(() => {
    /**
     * Applies search, filter, and sort to receipts.
     */
    const applyFiltersAndSort = () => {
      let result = [...receipts];

      // Apply search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        result = result.filter(
          (r) =>
            r.productDescription.toLowerCase().includes(term) ||
            r.storeName.toLowerCase().includes(term)
        );
      }

      // Apply warranty status filter
      if (warrantyFilter !== 'all') {
        result = result.filter((r) => getWarrantyCategory(r.warrantyExpiresOn) === warrantyFilter);
      }

      // Apply sorting
      switch (sortBy) {
        case 'date-desc':
          result.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
          break;
        case 'date-asc':
          result.sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));
          break;
        case 'price-desc':
          result.sort((a, b) => b.pricePaid - a.pricePaid);
          break;
        case 'price-asc':
          result.sort((a, b) => a.pricePaid - b.pricePaid);
          break;
        case 'warranty-expiry':
          result.sort((a, b) => new Date(a.warrantyExpiresOn) - new Date(b.warrantyExpiresOn));
          break;
        default:
          break;
      }

      setFilteredReceipts(result);
    };

    applyFiltersAndSort();
  }, [receipts, searchTerm, warrantyFilter, sortBy]);

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
      <h1 className="mb-4">My Receipts</h1>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Filters and Search */}
      <Card className="mb-4">
        <Card.Body>
          <Row>
            <Col md={4}>
              <InputGroup className="mb-3">
                <InputGroup.Text>Search</InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Product or store name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </Col>
            <Col md={4}>
              <InputGroup className="mb-3">
                <InputGroup.Text>Warranty Status</InputGroup.Text>
                <Form.Select
                  value={warrantyFilter}
                  onChange={(e) => setWarrantyFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="expiring">Expiring Soon</option>
                  <option value="expired">Expired</option>
                </Form.Select>
              </InputGroup>
            </Col>
            <Col md={4}>
              <InputGroup className="mb-3">
                <InputGroup.Text>Sort By</InputGroup.Text>
                <Form.Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="date-desc">Date (Newest First)</option>
                  <option value="date-asc">Date (Oldest First)</option>
                  <option value="price-desc">Price (High to Low)</option>
                  <option value="price-asc">Price (Low to High)</option>
                  <option value="warranty-expiry">Warranty Expiry</option>
                </Form.Select>
              </InputGroup>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Results Count */}
      <p className="text-muted mb-3">
        Showing {filteredReceipts.length} of {receipts.length} receipt(s)
      </p>

      {/* Receipts Table */}
      {filteredReceipts.length === 0 ? (
        <Alert variant="info">
          No receipts found matching your criteria.
        </Alert>
      ) : (
        <Card>
          <div className="table-responsive">
            <Table hover className="mb-0">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Store</th>
                  <th>Purchase Date</th>
                  <th>Price</th>
                  <th>Warranty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.map((receipt) => {
                  const badge = getWarrantyBadge(receipt.warrantyExpiresOn);
                  return (
                    <tr key={receipt.id}>
                      <td>
                        <strong>{receipt.productDescription}</strong>
                      </td>
                      <td>{receipt.storeName}</td>
                      <td>{receipt.purchaseDate}</td>
                      <td>€{receipt.pricePaid.toFixed(2)}</td>
                      <td>
                        {receipt.warrantyMonths} months
                        <br />
                        <small className="text-muted">Expires: {receipt.warrantyExpiresOn}</small>
                      </td>
                      <td>
                        <Badge bg={badge.variant}>{badge.text}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </Card>
      )}
    </Container>
  );
};

export default Receipts;