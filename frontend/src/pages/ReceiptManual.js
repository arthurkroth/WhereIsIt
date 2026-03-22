/**
 * File: ReceiptManual.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Card, Form, Button, Alert,
  Spinner, Row, Col
} from 'react-bootstrap';
import { createManualReceipt } from '../services/api';

/**
 * ReceiptManual Page
 * Allows users to manually enter receipt information without uploading a file.
 * Supports multiple line items per receipt, matching the database structure.
 *
 * FEATURES:
 * - Manual form entry for receipt header (store name, date)
 * - Add, edit, and remove multiple line items
 * - Live warranty expiry preview per item
 * - Calculated total shown when multiple items are present
 * - Client-side validation before submission
 *
 * SECURITY:
 * - Input sanitization through React
 * - Server-side validation as final check
 * - Data encrypted on backend before storage
 */
function ReceiptManual() {
  const navigate = useNavigate();

  // Receipt header state
  const [header, setHeader] = useState({
    storeName: '',
    purchaseDate: '',
    warrantyMonths: '12',
  });

  // Items list - each item has a description, price, and warranty duration
  const [items, setItems] = useState([
    { productDescription: '', price: '', warrantyMonths: '12' }
  ]);

  // UI state
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  /**
   * Handles changes to the receipt header fields.
   * Clears any existing validation error for the changed field.
   * @param {Event} e - Input change event
   */
  const handleHeaderChange = (e) => {
    const { name, value } = e.target;
    setHeader(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  /**
   * Handles changes to a specific item's fields.
   * Uses the item index to identify which item to update.
   *
   * @param {number} index - Index of the item in the items array
   * @param {string} field - Field name to update
   * @param {string} value - New value
   */
  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });

    // Clear any existing error for this specific item field
    const errorKey = `item_${index}_${field}`;
    if (errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  };

  /**
   * Adds a new blank item row to the items list.
   */
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      { productDescription: '', price: '', warrantyMonths: '12' }
    ]);
  };

  /**
   * Removes the item at the given index from the items list.
   * Always keeps at least one item row visible.
   *
   * @param {number} index - Index of the item to remove
   */
  const handleRemoveItem = (index) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Calculates the total price by summing all valid item prices.
   * Used to populate the totalPrice field when submitting.
   *
   * @returns {number} Sum of all item prices
   */
  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      const price = parseFloat(item.price);
      return sum + (isNaN(price) ? 0 : price);
    }, 0);
  };

  /**
   * Calculates the warranty expiry date from a purchase date and duration.
   * Used to show a live preview below each item row.
   *
   * @param {string} purchaseDate - Purchase date in YYYY-MM-DD format
   * @param {string|number} warrantyMonths - Warranty duration in months
   * @returns {string|null} Formatted expiry date or null if inputs are invalid
   */
  const calculateWarrantyExpiry = (purchaseDate, warrantyMonths) => {
    if (!purchaseDate || !warrantyMonths) return null;
    const date = new Date(purchaseDate);
    const months = parseInt(warrantyMonths, 10);
    if (isNaN(months)) return null;
    date.setMonth(date.getMonth() + months);
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  /**
   * Validates all form fields before submission.
   * Checks the receipt header and every item row.
   *
   * @returns {boolean} True if the entire form is valid
   */
  const validateForm = () => {
    const newErrors = {};

    // Validate receipt header
    if (!header.storeName.trim()) {
      newErrors.storeName = 'Store name is required';
    } else if (header.storeName.trim().length < 2) {
      newErrors.storeName = 'Store name must be at least 2 characters';
    }

    if (!header.purchaseDate) {
      newErrors.purchaseDate = 'Purchase date is required';
    } else if (new Date(header.purchaseDate) > new Date()) {
      newErrors.purchaseDate = 'Purchase date cannot be in the future';
    }

    const headerWarranty = parseInt(header.warrantyMonths, 10);
    if (isNaN(headerWarranty) || headerWarranty < 0 || headerWarranty > 120) {
      newErrors.warrantyMonths = 'Warranty must be between 0 and 120 months';
    }

    // Validate each item
    items.forEach((item, index) => {
      if (!item.productDescription.trim()) {
        newErrors[`item_${index}_productDescription`] = 'Product description is required';
      } else if (item.productDescription.trim().length < 3) {
        newErrors[`item_${index}_productDescription`] = 'Description must be at least 3 characters';
      }

      if (item.price === '' || item.price === undefined) {
        newErrors[`item_${index}_price`] = 'Price is required';
      } else {
        const price = parseFloat(item.price);
        if (isNaN(price) || price < 0) {
          newErrors[`item_${index}_price`] = 'Price must be a valid positive number';
        }
      }

      const itemWarranty = parseInt(item.warrantyMonths, 10);
      if (isNaN(itemWarranty) || itemWarranty < 0 || itemWarranty > 120) {
        newErrors[`item_${index}_warrantyMonths`] = 'Warranty must be between 0 and 120 months';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handles form submission.
   * Validates all fields, builds the request payload, and sends to the backend.
   *
   * @param {Event} e - Submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    setError('');

    try {
      const receiptData = {
        storeName: header.storeName.trim(),
        purchaseDate: header.purchaseDate,
        totalPrice: calculateTotal(),
        warrantyMonths: parseInt(header.warrantyMonths, 10),
        items: items.map(item => ({
          productDescription: item.productDescription.trim(),
          price: parseFloat(item.price) || 0,
          warrantyMonths: parseInt(item.warrantyMonths, 10) || 12
        }))
      };

      await createManualReceipt(receiptData);
      setSuccess(true);
      setTimeout(() => navigate('/receipts'), 1500);

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create receipt. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Resets the entire form back to its initial empty state.
   */
  const handleReset = () => {
    setHeader({ storeName: '', purchaseDate: '', warrantyMonths: '12' });
    setItems([{ productDescription: '', price: '', warrantyMonths: '12' }]);
    setErrors({});
    setError('');
  };

  return (
    <Container className="mt-4">
      <div className="row justify-content-center">
        <div className="col-lg-9">
          <Card>
            <Card.Header className="bg-primary text-white">
              <h4 className="mb-0">Add Receipt Manually</h4>
            </Card.Header>
            <Card.Body>

              {error && (
                <Alert variant="danger" onClose={() => setError('')} dismissible>
                  {error}
                </Alert>
              )}

              {success && (
                <Alert variant="success">
                  <strong>Success!</strong> Receipt created successfully. Redirecting...
                </Alert>
              )}

              <Form noValidate onSubmit={handleSubmit}>

                {/* ── Receipt Header ─────────────────────────────────────── */}
                <h5 className="mb-3">Receipt Details</h5>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Store Name <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="storeName"
                        value={header.storeName}
                        onChange={handleHeaderChange}
                        isInvalid={!!errors.storeName}
                        disabled={submitting}
                        placeholder="e.g. IKEA, Apple Store, Amazon"
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.storeName}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Purchase Date <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="date"
                        name="purchaseDate"
                        value={header.purchaseDate}
                        onChange={handleHeaderChange}
                        isInvalid={!!errors.purchaseDate}
                        disabled={submitting}
                        max={new Date().toISOString().split('T')[0]}
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.purchaseDate}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <hr className="my-4" />

                {/* ── Line Items ──────────────────────────────────────────── */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0">Items</h5>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleAddItem}
                    disabled={submitting}
                  >
                    + Add Item
                  </Button>
                </div>

                {items.map((item, index) => (
                  <Card key={index} className="mb-3 bg-light">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <strong>Item {index + 1}</strong>
                        {items.length > 1 && (
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                            disabled={submitting}
                          >
                            Remove
                          </Button>
                        )}
                      </div>

                      <Form.Group className="mb-3">
                        <Form.Label>
                          Product Description <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          type="text"
                          value={item.productDescription}
                          onChange={(e) => handleItemChange(index, 'productDescription', e.target.value)}
                          isInvalid={!!errors[`item_${index}_productDescription`]}
                          disabled={submitting}
                          placeholder="e.g. MITTZON desk 140x80 white"
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors[`item_${index}_productDescription`]}
                        </Form.Control.Feedback>
                      </Form.Group>

                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>
                              Price (€) <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.price}
                              onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                              isInvalid={!!errors[`item_${index}_price`]}
                              disabled={submitting}
                              placeholder="0.00"
                            />
                            <Form.Control.Feedback type="invalid">
                              {errors[`item_${index}_price`]}
                            </Form.Control.Feedback>
                          </Form.Group>
                        </Col>

                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>Warranty (months)</Form.Label>
                            <Form.Control
                              type="number"
                              min="0"
                              max="120"
                              value={item.warrantyMonths}
                              onChange={(e) => handleItemChange(index, 'warrantyMonths', e.target.value)}
                              isInvalid={!!errors[`item_${index}_warrantyMonths`]}
                              disabled={submitting}
                            />
                            <Form.Control.Feedback type="invalid">
                              {errors[`item_${index}_warrantyMonths`]}
                            </Form.Control.Feedback>
                            <Form.Text className="text-muted">Enter 0 if no warranty</Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>

                      {/* Live warranty expiry preview for this item */}
                      {calculateWarrantyExpiry(header.purchaseDate, item.warrantyMonths) && (
                        <small className="text-muted">
                          Warranty expires:{' '}
                          <strong>{calculateWarrantyExpiry(header.purchaseDate, item.warrantyMonths)}</strong>
                        </small>
                      )}
                    </Card.Body>
                  </Card>
                ))}

                {/* Show calculated total when there are multiple items */}
                {items.length > 1 && (
                  <Alert variant="info" className="mt-2">
                    <strong>Calculated Total: €{calculateTotal().toFixed(2)}</strong>
                    {' '}({items.length} items)
                  </Alert>
                )}

                <hr className="my-4" />

                {/* ── Action Buttons ───────────────────────────────────────── */}
                <div className="d-flex justify-content-end gap-2">
                  <Button
                    variant="outline-secondary"
                    onClick={() => navigate('/receipts')}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline-danger"
                    onClick={handleReset}
                    disabled={submitting}
                  >
                    Reset Form
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Spinner as="span" animation="border" size="sm" className="me-2" />
                        Creating...
                      </>
                    ) : (
                      'Create Receipt'
                    )}
                  </Button>
                </div>
              </Form>

              <Alert variant="secondary" className="mt-4 mb-0">
                <small>
                  <strong>Tip:</strong> All information is securely encrypted before storage.
                  You can also{' '}
                  <Button variant="link" className="p-0" onClick={() => navigate('/receipt/upload')}>
                    upload a receipt file
                  </Button>{' '}
                  for automatic data extraction.
                </small>
              </Alert>

            </Card.Body>
          </Card>
        </div>
      </div>
    </Container>
  );
}

export default ReceiptManual;