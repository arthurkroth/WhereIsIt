/**
 * File: ReceiptDetail.js
 * Author: Arthur Kroth - x22166971
 * Date: 17/03/2026
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Card, Row, Col, Badge, Button,
  Alert, Spinner, Form, Modal
} from 'react-bootstrap';
import { getReceiptById, getReceiptFileUrl } from '../services/api';
import api from '../services/api';

/**
 * ReceiptDetail Page
 * Shows full details of a single receipt and allows editing.
 * Also displays the original uploaded receipt image or PDF.
 *
 * FEATURES:
 * - View all receipt details
 * - View original uploaded image (via blob URL) or PDF (via embed + blob URL)
 * - Edit receipt fields inline
 * - Delete receipt with confirmation
 * - Warranty status display
 *
 * SECURITY:
 * - Only the owner can view/edit/delete (enforced by backend)
 * - File served securely through authenticated endpoint
 * - Both images and PDFs are fetched via blob URLs to avoid cross-origin issues
 */
function ReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Holds the blob URL for the receipt file (works for both images and PDFs).
  // We use a blob URL to avoid cross-origin/CSP issues with the backend on a different port.
  const [fileUrl, setFileUrl] = useState(null);

  // Edit form state - populated when user clicks Edit
  const [editForm, setEditForm] = useState({
    storeName: '',
    purchaseDate: '',
    productDescription: '',
    price: '',
    warrantyMonths: ''
  });

  /**
   * Fetches receipt details when the page loads or ID changes.
   */
  useEffect(() => {
    fetchReceipt();
  }, [id]);

  /**
   * Fetches the receipt file as a blob using the auth token.
   * Works for both images and PDFs.
   *
   * We use a blob URL (URL.createObjectURL) instead of a direct URL because:
   * - The backend runs on port 3001 and the frontend on port 3000
   * - The browser blocks direct cross-origin requests in <img> and <embed> tags
   * - Fetching via fetch() with an Authorization header bypasses this restriction
   */
  useEffect(() => {
    // Only run if receipt has an attached file
    if (!receipt?.hasFile) return;

    const fetchFile = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `http://localhost:3001/receipts/${receipt.id}/file`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) return;

        // Convert the response to a blob and create a local object URL
        // This URL is safe to use in both <img src> and <embed src>
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setFileUrl(url);
      } catch (err) {
        console.error('Failed to load receipt file:', err);
      }
    };

    fetchFile();

    // Cleanup: revoke the blob URL when the component unmounts to free memory
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [receipt]);

  /**
   * Fetches a single receipt by ID from the backend.
   */
  const fetchReceipt = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getReceiptById(id);
      setReceipt(response.data.receipt);

      // Pre-populate the edit form with current values
      setEditForm({
        storeName: response.data.receipt.storeName,
        purchaseDate: response.data.receipt.purchaseDate,
        productDescription: response.data.receipt.productDescription,
        price: response.data.receipt.price,
        warrantyMonths: response.data.receipt.warrantyMonths
      });
    } catch (err) {
      setError('Failed to load receipt details');
      console.error('Fetch receipt error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles changes to the edit form fields.
   * @param {string} field - Field name to update
   * @param {string} value - New value
   */
  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * Saves the edited receipt data to the backend.
   */
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/receipts/${id}`, {
        storeName: editForm.storeName,
        purchaseDate: editForm.purchaseDate,
        productDescription: editForm.productDescription,
        price: parseFloat(editForm.price),
        warrantyMonths: parseInt(editForm.warrantyMonths)
      });

      // Refresh the receipt data after saving
      await fetchReceipt();
      setEditing(false);
    } catch (err) {
      setError('Failed to save changes');
      console.error('Save receipt error:', err);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Deletes the receipt and navigates back to the list.
   */
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/receipts/${id}`);
      navigate('/receipts');
    } catch (err) {
      setError('Failed to delete receipt');
      console.error('Delete receipt error:', err);
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  /**
   * Returns Bootstrap Badge variant based on warranty status.
   * @param {string} status - 'active', 'expiring_soon', or 'expired'
   * @returns {string} Bootstrap variant name
   */
  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'active':        return 'success';
      case 'expiring_soon': return 'warning';
      case 'expired':       return 'danger';
      default:              return 'secondary';
    }
  };

  /**
   * Formats a date string for human-readable display.
   * @param {string} dateString - Date in YYYY-MM-DD format
   * @returns {string} Human-readable date e.g. "20 December 2025"
   */
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-GB', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  /**
   * Checks if the attached file is a PDF based on its filename extension.
   * Used to decide whether to render an <embed> tag (PDF) or <img> tag (image).
   * @returns {boolean} True if the file is a PDF
   */
  const isPdf = () => {
    return receipt?.fileName?.toLowerCase().endsWith('.pdf');
  };

  // Show spinner while loading
  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading receipt...</p>
      </Container>
    );
  }

  // Show error if fetch failed and we have no receipt to show
  if (error && !receipt) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">{error}</Alert>
        <Button variant="secondary" onClick={() => navigate('/receipts')}>
          Back to Receipts
        </Button>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      {/* Header with Back button and Edit/Delete actions */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => navigate('/receipts')}
            className="me-2"
          >
            ← Back
          </Button>
          <span className="h4">Receipt Details</span>
        </div>
        <div>
          {!editing && (
            <>
              <Button variant="primary" className="me-2" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="outline-danger" onClick={() => setShowDeleteModal(true)}>
                Delete
              </Button>
            </>
          )}
          {editing && (
            <>
              <Button variant="success" className="me-2" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner as="span" animation="border" size="sm" className="me-1" /> : null}
                Save Changes
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => { setEditing(false); fetchReceipt(); }}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError('')} dismissible>
          {error}
        </Alert>
      )}

      <Row>
        {/* Left column: receipt details */}
        <Col md={receipt?.hasFile ? 7 : 12}>
          <Card className="mb-4">
            <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
              <strong>Purchase Information</strong>
              <Badge bg={getStatusBadgeVariant(receipt?.warrantyStatus)}>
                {receipt?.warrantyStatus?.replace('_', ' ').toUpperCase()}
              </Badge>
            </Card.Header>
            <Card.Body>
              {editing ? (
                // Edit mode - show editable form fields
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Store Name</Form.Label>
                    <Form.Control
                      type="text"
                      value={editForm.storeName}
                      onChange={(e) => handleEditChange('storeName', e.target.value)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Purchase Date</Form.Label>
                    <Form.Control
                      type="date"
                      value={editForm.purchaseDate}
                      onChange={(e) => handleEditChange('purchaseDate', e.target.value)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Product Description</Form.Label>
                    <Form.Control
                      type="text"
                      value={editForm.productDescription}
                      onChange={(e) => handleEditChange('productDescription', e.target.value)}
                    />
                  </Form.Group>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Price (€)</Form.Label>
                        <Form.Control
                          type="number"
                          step="0.01"
                          min="0"
                          value={editForm.price}
                          onChange={(e) => handleEditChange('price', e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Warranty (months)</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          value={editForm.warrantyMonths}
                          onChange={(e) => handleEditChange('warrantyMonths', e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                </>
              ) : (
                // View mode - display receipt data as read-only
                <Row>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Store</small>
                    <div><strong>{receipt?.storeName}</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Purchase Date</small>
                    <div><strong>{formatDate(receipt?.purchaseDate)}</strong></div>
                  </Col>
                  <Col md={12} className="mb-3">
                    <small className="text-muted">Product Description</small>
                    <div><strong>{receipt?.productDescription}</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Price Paid</small>
                    <div><strong>€{parseFloat(receipt?.price || 0).toFixed(2)}</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Warranty Duration</small>
                    <div><strong>{receipt?.warrantyMonths} months</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Warranty Expires</small>
                    <div><strong>{formatDate(receipt?.warrantyExpiry)}</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Uploaded On</small>
                    <div><strong>{formatDate(receipt?.createdAt)}</strong></div>
                  </Col>
                </Row>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Right column: receipt file preview (image or PDF) */}
        {receipt?.hasFile && (
          <Col md={5}>
            <Card>
              <Card.Header className="bg-secondary text-white">
                {/* Show different label depending on file type */}
                <strong>{isPdf() ? 'Receipt PDF' : 'Receipt Image'}</strong>
              </Card.Header>
              <Card.Body className="text-center">
                {fileUrl ? (
                  isPdf() ? (
                    // PDFs use <embed> with the blob URL - avoids cross-origin issues
                    <embed
                      src={fileUrl}
                      type="application/pdf"
                      width="100%"
                      height="500px"
                      style={{ borderRadius: '4px' }}
                    />
                  ) : (
                    // Images use <img> with the blob URL
                    <img
                      src={fileUrl}
                      alt="Receipt"
                      className="img-fluid rounded"
                      style={{ maxHeight: '500px', objectFit: 'contain' }}
                    />
                  )
                ) : (
                  // Show spinner while the blob URL is being fetched
                  <div className="py-4">
                    <Spinner animation="border" variant="secondary" />
                    <p className="mt-2 text-muted">
                      {isPdf() ? 'Loading PDF...' : 'Loading image...'}
                    </p>
                  </div>
                )}
                <div className="mt-2">
                  <a
                    href={getReceiptFileUrl(receipt.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-outline-secondary"
                  >
                    Open Full Size
                  </a>
                </div>
              </Card.Body>
            </Card>
          </Col>
        )}
      </Row>

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this receipt? This action cannot be undone
          and the file will also be permanently deleted.
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowDeleteModal(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Spinner as="span" animation="border" size="sm" className="me-1" /> : null}
            Delete Receipt
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default ReceiptDetail;