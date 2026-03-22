/**
 * File: ReceiptDetail.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Card, Row, Col, Badge, Button,
  Alert, Spinner, Form, Modal, Table
} from 'react-bootstrap';
import { getReceiptById, getReceiptFileUrl } from '../services/api';
import api from '../services/api';

/**
 * ReceiptDetail Page
 * Shows full details of a single receipt including all its line items.
 * Allows the user to edit or delete the receipt.
 *
 * FEATURES:
 * - View all receipt header details (store, date, total, warranty)
 * - View all line items in a table with individual prices and warranties
 * - Edit receipt header and items inline
 * - Total price auto-recalculates when items are added, removed, or changed
 * - Add/remove items during editing
 * - View original uploaded image or PDF
 * - Delete receipt with confirmation modal
 *
 * DATE FORMAT NOTE:
 * MySQL returns dates as full ISO timestamps e.g. "2025-02-16T00:00:00.000Z".
 * The HTML <input type="date"> requires "YYYY-MM-DD" format only.
 * We always convert using toISOString().split('T')[0] when populating the
 * edit form, otherwise the date input renders blank and saving fails.
 *
 * SECURITY:
 * - Only the owner can view/edit/delete (enforced by backend)
 * - File served securely through authenticated endpoint using blob URL
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

  // Blob URL for the receipt file (avoids CSP cross-origin issues)
  const [fileUrl, setFileUrl] = useState(null);

  // Edit form state - header fields
  const [editHeader, setEditHeader] = useState({
    storeName: '',
    purchaseDate: '',
    totalPrice: '',
    warrantyMonths: ''
  });

  // Edit form state - items array
  const [editItems, setEditItems] = useState([]);

  /**
   * Fetches receipt details when the page loads or the ID changes.
   */
  useEffect(() => {
    fetchReceipt();
  }, [id]);

  /**
   * Auto-recalculates the total price whenever the items list changes.
   * This ensures the total is always the sum of all item prices, so the user
   * never has to manually update the total when adding or removing items.
   *
   * We only do this when editing is active, to avoid overwriting the
   * loaded total price on initial page load.
   */
  useEffect(() => {
    if (!editing) return;

    const calculatedTotal = editItems.reduce((sum, item) => {
      const price = parseFloat(item.price);
      return sum + (isNaN(price) ? 0 : price);
    }, 0);

    setEditHeader(prev => ({
      ...prev,
      totalPrice: calculatedTotal.toFixed(2)
    }));
  }, [editItems, editing]);

  /**
   * Fetches the receipt file as a blob URL using the auth token.
   * Works for both images and PDFs.
   */
  useEffect(() => {
    if (!receipt?.hasFile) return;

    const fetchFile = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `http://localhost:3001/receipts/${receipt.id}/file`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) return;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setFileUrl(url);
      } catch (err) {
        console.error('Failed to load receipt file:', err);
      }
    };

    fetchFile();

    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [receipt]);

  /**
   * Fetches a single receipt by ID from the backend.
   * Populates both the display state and the edit form state.
   *
   * IMPORTANT: MySQL may return the purchase_date as a full ISO timestamp
   * (e.g. "2025-02-16T00:00:00.000Z"). The HTML date input only accepts
   * "YYYY-MM-DD", so we always strip the time portion when setting editHeader.
   */
  const fetchReceipt = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getReceiptById(id);
      const data = response.data.receipt;
      setReceipt(data);

      // Convert the date to YYYY-MM-DD for the HTML date input
      const formattedDate = data.purchaseDate
        ? new Date(data.purchaseDate).toISOString().split('T')[0]
        : '';

      setEditHeader({
        storeName: data.storeName || '',
        purchaseDate: formattedDate,
        totalPrice: data.totalPrice || '',
        warrantyMonths: data.warrantyMonths || 12
      });

      setEditItems(
        data.items?.length > 0
          ? data.items.map(item => ({
              productDescription: item.productDescription,
              price: item.price,
              warrantyMonths: item.warrantyMonths
            }))
          : [{ productDescription: '', price: '', warrantyMonths: 12 }]
      );
    } catch (err) {
      setError('Failed to load receipt details');
      console.error('Fetch receipt error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles changes to the edit header fields.
   * Note: totalPrice can still be manually overridden here if needed,
   * but it will be recalculated automatically when items change.
   * @param {string} field - Field name
   * @param {string} value - New value
   */
  const handleHeaderChange = (field, value) => {
    setEditHeader(prev => ({ ...prev, [field]: value }));
  };

  /**
   * Handles changes to a specific item in the edit items list.
   * Triggers the auto-total recalculation via the useEffect above.
   * @param {number} index - Item index
   * @param {string} field - Field name
   * @param {string} value - New value
   */
  const handleItemChange = (index, field, value) => {
    setEditItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  /**
   * Adds a new blank item row to the edit items list.
   * The total will automatically recalculate via the useEffect.
   */
  const handleAddItem = () => {
    setEditItems(prev => [
      ...prev,
      { productDescription: '', price: '', warrantyMonths: 12 }
    ]);
  };

  /**
   * Removes an item from the edit items list.
   * Always keeps at least one item row.
   * The total will automatically recalculate via the useEffect.
   * @param {number} index - Index of the item to remove
   */
  const handleRemoveItem = (index) => {
    if (editItems.length === 1) return;
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Saves the edited receipt data to the backend.
   */
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/receipts/${id}`, {
        storeName: editHeader.storeName,
        purchaseDate: editHeader.purchaseDate,
        totalPrice: parseFloat(editHeader.totalPrice) || 0,
        warrantyMonths: parseInt(editHeader.warrantyMonths) || 12,
        items: editItems.map(item => ({
          productDescription: item.productDescription,
          price: parseFloat(item.price) || 0,
          warrantyMonths: parseInt(item.warrantyMonths) || 12
        }))
      });

      // Refresh the displayed data after saving
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
   * Handles both "YYYY-MM-DD" and full ISO timestamp formats.
   * @param {string} dateString - Date to format
   * @returns {string} Human-readable date
   */
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  /**
   * Checks if the attached file is a PDF based on its filename extension.
   * @returns {boolean} True if the file is a PDF
   */
  const isPdf = () => {
    return receipt?.fileName?.toLowerCase().endsWith('.pdf');
  };

  // Show spinner while loading
  if (loading) {
    return (
      <Container className="mt-0 text-center">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading receipt...</p>
      </Container>
    );
  }

  // Show error if the fetch failed and we have nothing to display
  if (error && !receipt) {
    return (
      <Container className="mt-0">
        <Alert variant="danger">{error}</Alert>
        <Button variant="secondary" onClick={() => navigate('/receipts')}>
          Back to Receipts
        </Button>
      </Container>
    );
  }

  return (
    <Container className="mt-0">

      {/* Header with back button and action buttons */}
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
                {saving
                  ? <Spinner as="span" animation="border" size="sm" className="me-1" />
                  : null
                }
                Save Changes
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => { setEditing(false); fetchReceipt(); }}
                disabled={saving}
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

          {/* Receipt header card */}
          <Card className="mb-4">
            <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
              <strong>Purchase Information</strong>
              <Badge bg={getStatusBadgeVariant(receipt?.warrantyStatus)}>
                {receipt?.warrantyStatus?.replace('_', ' ').toUpperCase()}
              </Badge>
            </Card.Header>
            <Card.Body>
              {editing ? (
                // Edit mode: show editable header fields
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Store Name</Form.Label>
                    <Form.Control
                      type="text"
                      value={editHeader.storeName}
                      onChange={(e) => handleHeaderChange('storeName', e.target.value)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Purchase Date</Form.Label>
                    <Form.Control
                      type="date"
                      value={editHeader.purchaseDate}
                      onChange={(e) => handleHeaderChange('purchaseDate', e.target.value)}
                    />
                  </Form.Group>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        {/* Total price is auto-calculated from items but can still be manually overridden */}
                        <Form.Label>Total Price (€) <small className="text-muted fw-normal">— auto-calculated</small></Form.Label>
                        <Form.Control
                          type="number"
                          step="0.01"
                          min="0"
                          value={editHeader.totalPrice}
                          onChange={(e) => handleHeaderChange('totalPrice', e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Receipt Warranty (months)</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          value={editHeader.warrantyMonths}
                          onChange={(e) => handleHeaderChange('warrantyMonths', e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                </>
              ) : (
                // View mode: display receipt header as read-only
                <Row>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Store</small>
                    <div><strong>{receipt?.storeName}</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Purchase Date</small>
                    <div><strong>{formatDate(receipt?.purchaseDate)}</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Total Price</small>
                    <div><strong>€{parseFloat(receipt?.totalPrice || 0).toFixed(2)}</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Warranty Expires</small>
                    <div><strong>{formatDate(receipt?.warrantyExpiry)}</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Uploaded On</small>
                    <div><strong>{formatDate(receipt?.createdAt)}</strong></div>
                  </Col>
                  <Col md={6} className="mb-3">
                    <small className="text-muted">Items</small>
                    <div><strong>{receipt?.itemCount || 0} item(s)</strong></div>
                  </Col>
                </Row>
              )}
            </Card.Body>
          </Card>

          {/* Items card */}
          <Card className="mb-4">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <strong>Line Items</strong>
              {editing && (
                <Button variant="outline-primary" size="sm" onClick={handleAddItem}>
                  + Add Item
                </Button>
              )}
            </Card.Header>
            <Card.Body className={editing ? '' : 'p-0'}>
              {editing ? (
                // Edit mode: editable item cards
                editItems.map((item, index) => (
                  <Card key={index} className="mb-3 bg-light">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <strong>Item {index + 1}</strong>
                        {editItems.length > 1 && (
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <Form.Group className="mb-3">
                        <Form.Label>Product Description</Form.Label>
                        <Form.Control
                          type="text"
                          value={item.productDescription}
                          onChange={(e) => handleItemChange(index, 'productDescription', e.target.value)}
                        />
                      </Form.Group>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-2">
                            <Form.Label>Price (€)</Form.Label>
                            <Form.Control
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.price}
                              onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-2">
                            <Form.Label>Warranty (months)</Form.Label>
                            <Form.Control
                              type="number"
                              min="0"
                              max="120"
                              value={item.warrantyMonths}
                              onChange={(e) => handleItemChange(index, 'warrantyMonths', e.target.value)}
                            />
                          </Form.Group>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                ))
              ) : (
                // View mode: items in a read-only table
                <div className="table-responsive">
                  <Table className="mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Product</th>
                        <th>Price</th>
                        <th>Warranty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt?.items?.length > 0 ? (
                        receipt.items.map((item, index) => (
                          <tr key={index}>
                            <td>{item.productDescription}</td>
                            <td>€{parseFloat(item.price || 0).toFixed(2)}</td>
                            <td>{item.warrantyMonths} months</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3" className="text-center text-muted">No items found</td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>

        </Col>

        {/* Right column: receipt file preview */}
        {receipt?.hasFile && (
          <Col md={5}>
            <Card>
              <Card.Header className="bg-secondary text-white">
                <strong>{isPdf() ? 'Receipt PDF' : 'Receipt Image'}</strong>
              </Card.Header>
              <Card.Body className="text-center">
                {fileUrl ? (
                  isPdf() ? (
                    // PDFs: embed with parameters to hide browser PDF UI panels
                    <embed
                      src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                      type="application/pdf"
                      width="100%"
                      height="500px"
                      style={{ borderRadius: '4px' }}
                    />
                  ) : (
                    // Images: img tag with blob URL
                    <img
                      src={fileUrl}
                      alt="Receipt"
                      className="img-fluid rounded"
                      style={{ maxHeight: '500px', objectFit: 'contain' }}
                    />
                  )
                ) : (
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
          Are you sure you want to delete this receipt and all its items? This action
          cannot be undone and the file will also be permanently deleted.
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
            {deleting
              ? <Spinner as="span" animation="border" size="sm" className="me-1" />
              : null
            }
            Delete Receipt
          </Button>
        </Modal.Footer>
      </Modal>

    </Container>
  );
}

export default ReceiptDetail;