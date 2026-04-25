/**
 * File: ReceiptList.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Card, Table, Badge, Button,
  Alert, Spinner, InputGroup, Form, Row, Col, Collapse
} from 'react-bootstrap';
import { listReceipts } from '../services/api';

/**
 * ReceiptList Page
 * Displays all receipts for the authenticated user with search, filter, and sort.
 *
 * FILTERS:
 * - Text search: store name or first item description
 * - Warranty status: All / Active / Expiring Soon / Expired
 * - Date range: from / to purchase date
 * - Price range: min / max total price
 * - Tags: filter by selected tags
 *
 * SORTING:
 * - Date (newest / oldest)
 * - Price (high to low / low to high)
 * - Store (A–Z / Z–A)
 */
function ReceiptList() {
  const navigate = useNavigate();

  const [receipts, setReceipts] = useState([]);
  const [filteredReceipts, setFilteredReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { fetchReceipts(); }, []);

  const fetchReceipts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listReceipts();
      setReceipts(response.data.receipts || []);
    } catch (err) {
      setError('Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };

  // Re-apply filters/sort whenever any filter or receipts change
  useEffect(() => {
    let filtered = [...receipts];

    // Text search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.storeName.toLowerCase().includes(term) ||
        r.firstItemDescription?.toLowerCase().includes(term) ||
        r.notes?.toLowerCase().includes(term)
      );
    }

    // Warranty status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(r => {
        const status = getWarrantyStatus(r.warrantyExpiry);
        return status.toLowerCase() === filterStatus;
      });
    }

    // Date range filter
    if (dateFrom) {
      filtered = filtered.filter(r => r.purchaseDate && r.purchaseDate >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(r => r.purchaseDate && r.purchaseDate <= dateTo);
    }

    // Price range filter
    if (priceMin !== '') {
      filtered = filtered.filter(r => parseFloat(r.totalPrice) >= parseFloat(priceMin));
    }
    if (priceMax !== '') {
      filtered = filtered.filter(r => parseFloat(r.totalPrice) <= parseFloat(priceMax));
    }

    // Tag filter
    if (filterTag) {
      filtered = filtered.filter(r => Array.isArray(r.tags) && r.tags.includes(filterTag));
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc': return new Date(b.purchaseDate) - new Date(a.purchaseDate);
        case 'date_asc':  return new Date(a.purchaseDate) - new Date(b.purchaseDate);
        case 'price_desc': return parseFloat(b.totalPrice || 0) - parseFloat(a.totalPrice || 0);
        case 'price_asc':  return parseFloat(a.totalPrice || 0) - parseFloat(b.totalPrice || 0);
        case 'store_asc':  return a.storeName.localeCompare(b.storeName);
        case 'store_desc': return b.storeName.localeCompare(a.storeName);
        default: return 0;
      }
    });

    setFilteredReceipts(filtered);
  }, [receipts, searchTerm, filterStatus, dateFrom, dateTo, priceMin, priceMax, filterTag, sortBy]);

  /**
   * Collects all unique tags across all receipts for the tag filter dropdown.
   */
  const allTags = [...new Set(receipts.flatMap(r => Array.isArray(r.tags) ? r.tags : []))].sort();

  const getWarrantyStatus = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'Expired';
    if (daysLeft <= 30) return 'Expiring Soon';
    return 'Active';
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

  /**
   * Resets all filter and sort controls to their default values.
   */
  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setDateFrom('');
    setDateTo('');
    setPriceMin('');
    setPriceMax('');
    setFilterTag('');
    setSortBy('date_desc');
  };

  const hasActiveFilters = searchTerm || filterStatus !== 'all' || dateFrom || dateTo ||
    priceMin !== '' || priceMax !== '' || filterTag || sortBy !== 'date_desc';

  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>My Receipts</h2>
        <div>
          <Button variant="primary" className="me-2" onClick={() => navigate('/receipt/upload')}>Upload Receipt</Button>
          <Button variant="outline-primary" onClick={() => navigate('/receipt/manual')}>Add Manually</Button>
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      {/* Search, sort, and filter bar */}
      <Card className="mb-4">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col md={5}>
              <InputGroup>
                <Form.Control type="text" placeholder="Search by store, product, or notes..."
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                {searchTerm && <Button variant="outline-secondary" onClick={() => setSearchTerm('')}>✕</Button>}
              </InputGroup>
            </Col>
            <Col md={3}>
              <Form.Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="date_desc">Date: Newest first</option>
                <option value="date_asc">Date: Oldest first</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="store_asc">Store: A–Z</option>
                <option value="store_desc">Store: Z–A</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Button variant="outline-secondary" className="w-100"
                onClick={() => setShowFilters(!showFilters)}>
                {showFilters ? 'Hide Filters' : 'Show Filters'}
                {hasActiveFilters && <Badge bg="primary" className="ms-2">!</Badge>}
              </Button>
            </Col>
            <Col md={2}>
              {hasActiveFilters && (
                <Button variant="outline-danger" className="w-100" onClick={handleClearFilters}>
                  Clear All
                </Button>
              )}
            </Col>
          </Row>

          {/* Expandable advanced filters */}
          <Collapse in={showFilters}>
            <div className="mt-3 pt-3 border-top">
              <Row className="g-3">
                <Col md={3}>
                  <Form.Label className="small fw-semibold">Warranty Status</Form.Label>
                  <Form.Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="expiring soon">Expiring Soon</option>
                    <option value="expired">Expired</option>
                  </Form.Select>
                </Col>
                <Col md={3}>
                  <Form.Label className="small fw-semibold">Date From</Form.Label>
                  <Form.Control type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </Col>
                <Col md={3}>
                  <Form.Label className="small fw-semibold">Date To</Form.Label>
                  <Form.Control type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </Col>
                <Col md={3}>
                  <Form.Label className="small fw-semibold">Tag</Form.Label>
                  <Form.Select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
                    <option value="">All Tags</option>
                    {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                  </Form.Select>
                </Col>
                <Col md={3}>
                  <Form.Label className="small fw-semibold">Min Price (€)</Form.Label>
                  <Form.Control type="number" min="0" step="0.01" placeholder="0.00"
                    value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
                </Col>
                <Col md={3}>
                  <Form.Label className="small fw-semibold">Max Price (€)</Form.Label>
                  <Form.Control type="number" min="0" step="0.01" placeholder="No limit"
                    value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
                </Col>
              </Row>
            </div>
          </Collapse>
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
            <h4>{receipts.length === 0 ? 'No receipts yet' : 'No matching receipts'}</h4>
            <p className="text-muted">
              {receipts.length === 0
                ? 'Upload your first receipt to get started!'
                : 'Try adjusting your search or filter criteria.'}
            </p>
            {receipts.length === 0 && (
              <div className="mt-3">
                <Button variant="primary" className="me-2" onClick={() => navigate('/receipt/upload')}>Upload Receipt</Button>
                <Button variant="outline-primary" onClick={() => navigate('/receipt/manual')}>Add Manually</Button>
              </div>
            )}
            {hasActiveFilters && (
              <Button variant="outline-secondary" className="mt-2" onClick={handleClearFilters}>Clear Filters</Button>
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
                    <th>Items</th>
                    <th>Tags</th>
                    <th>Purchase Date</th>
                    <th>Total</th>
                    <th>Warranty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.map((receipt) => {
                    const status = getWarrantyStatus(receipt.warrantyExpiry);
                    return (
                      <tr key={receipt.id} onClick={() => navigate(`/receipts/${receipt.id}`)}
                        style={{ cursor: 'pointer' }}>
                        <td><strong>{receipt.storeName}</strong></td>
                        <td>
                          <div>{receipt.firstItemDescription}</div>
                          {receipt.itemCount > 1 && (
                            <small className="text-muted">+{receipt.itemCount - 1} more item{receipt.itemCount - 1 > 1 ? 's' : ''}</small>
                          )}
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {receipt.tags?.length > 0
                              ? receipt.tags.map(tag => (
                                <span key={tag} className="badge rounded-pill bg-light text-dark border"
                                  style={{ fontSize: '0.75rem' }}>{tag}</span>
                              ))
                              : <span className="text-muted small">—</span>}
                          </div>
                        </td>
                        <td>{formatDate(receipt.purchaseDate)}</td>
                        <td>{formatCurrency(receipt.totalPrice)}</td>
                        <td>
                          <div>{receipt.warrantyMonths} months</div>
                          <small className="text-muted">Expires: {formatDate(receipt.warrantyExpiry)}</small>
                        </td>
                        <td><Badge bg={getStatusBadgeVariant(status)}>{status}</Badge></td>
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