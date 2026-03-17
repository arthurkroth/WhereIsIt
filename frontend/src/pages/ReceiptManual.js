/**
 * File: ReceiptManual.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Card, Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap';
import { createManualReceipt } from '../services/api';

/**
 * ReceiptManual Page
 * Allows users to manually enter receipt information without uploading a file.
 * 
 * FEATURES:
 * - Manual form entry for all receipt fields
 * - Client-side validation before submission
 * - Warranty calculation preview
 * - User-friendly date picker
 * 
 * SECURITY:
 * - Input sanitization through React
 * - Server-side validation as final check
 * - Data encrypted on backend before storage
 * - No SQL injection risk (using parameterized queries on backend)
 */
function ReceiptManual() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    storeName: '',
    purchaseDate: '',
    productDescription: '',
    pricePaid: '',
    warrantyMonths: '',
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  /**
   * Handles input change and updates form data.
   * Clears field-specific error when user starts typing.
   * @param {Event} e - Input change event
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear field error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  /**
   * Validates form data before submission.
   * @returns {boolean} True if form is valid
   */
  const validateForm = () => {
    const newErrors = {};

    // Store name validation
    if (!formData.storeName.trim()) {
      newErrors.storeName = 'Store name is required';
    } else if (formData.storeName.length < 2) {
      newErrors.storeName = 'Store name must be at least 2 characters';
    }

    // Purchase date validation
    if (!formData.purchaseDate) {
      newErrors.purchaseDate = 'Purchase date is required';
    } else {
      const purchaseDate = new Date(formData.purchaseDate);
      const today = new Date();
      if (purchaseDate > today) {
        newErrors.purchaseDate = 'Purchase date cannot be in the future';
      }
    }

    // Product description validation
    if (!formData.productDescription.trim()) {
      newErrors.productDescription = 'Product description is required';
    } else if (formData.productDescription.length < 3) {
      newErrors.productDescription = 'Product description must be at least 3 characters';
    }

    // Price validation
    if (!formData.pricePaid) {
      newErrors.pricePaid = 'Price is required';
    } else {
      const price = parseFloat(formData.pricePaid);
      if (isNaN(price) || price < 0) {
        newErrors.pricePaid = 'Price must be a valid positive number';
      }
    }

    // Warranty validation
    if (!formData.warrantyMonths) {
      newErrors.warrantyMonths = 'Warranty duration is required';
    } else {
      const warranty = parseInt(formData.warrantyMonths, 10);
      if (isNaN(warranty) || warranty < 0) {
        newErrors.warrantyMonths = 'Warranty must be a valid positive number';
      } else if (warranty > 120) {
        newErrors.warrantyMonths = 'Warranty cannot exceed 120 months (10 years)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handles form submission.
   * @param {Event} e - Submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      // Prepare data for submission
      const receiptData = {
        storeName: formData.storeName.trim(),
        purchaseDate: formData.purchaseDate,
        productDescription: formData.productDescription.trim(),
        pricePaid: parseFloat(formData.pricePaid),
        warrantyMonths: parseInt(formData.warrantyMonths, 10),
      };

      await createManualReceipt(receiptData);

      setSuccess(true);

      // Redirect to receipts list after short delay
      setTimeout(() => {
        navigate('/receipts');
      }, 1500);

    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create receipt');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Calculates and formats warranty expiry date for preview.
   * @returns {string|null} Formatted expiry date or null
   */
  const calculateWarrantyExpiry = () => {
    if (!formData.purchaseDate || !formData.warrantyMonths) {
      return null;
    }

    const purchaseDate = new Date(formData.purchaseDate);
    const warranty = parseInt(formData.warrantyMonths, 10);

    if (isNaN(warranty)) {
      return null;
    }

    const expiryDate = new Date(purchaseDate);
    expiryDate.setMonth(expiryDate.getMonth() + warranty);

    return expiryDate.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  /**
   * Resets form to initial state.
   */
  const handleReset = () => {
    setFormData({
      storeName: '',
      purchaseDate: '',
      productDescription: '',
      pricePaid: '',
      warrantyMonths: '',
    });
    setErrors({});
    setError('');
  };

  return (
    <Container className="mt-4">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <Card>
            <Card.Header className="bg-primary text-white">
              <h4 className="mb-0">
                <i className="bi bi-pencil-square me-2"></i>
                Add Receipt Manually
              </h4>
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

              <Form onSubmit={handleSubmit}>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Store Name <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="storeName"
                        value={formData.storeName}
                        onChange={handleChange}
                        isInvalid={!!errors.storeName}
                        disabled={submitting}
                        placeholder="e.g., Amazon, Best Buy, Apple Store"
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
                        value={formData.purchaseDate}
                        onChange={handleChange}
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

                <Form.Group className="mb-3">
                  <Form.Label>
                    Product Description <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    name="productDescription"
                    value={formData.productDescription}
                    onChange={handleChange}
                    isInvalid={!!errors.productDescription}
                    disabled={submitting}
                    placeholder="e.g., iPhone 15 Pro 256GB, Samsung 65-inch 4K TV"
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.productDescription}
                  </Form.Control.Feedback>
                </Form.Group>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Price Paid (€) <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        min="0"
                        name="pricePaid"
                        value={formData.pricePaid}
                        onChange={handleChange}
                        isInvalid={!!errors.pricePaid}
                        disabled={submitting}
                        placeholder="0.00"
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.pricePaid}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Warranty Duration (months) <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min="0"
                        max="120"
                        name="warrantyMonths"
                        value={formData.warrantyMonths}
                        onChange={handleChange}
                        isInvalid={!!errors.warrantyMonths}
                        disabled={submitting}
                        placeholder="e.g., 12, 24, 36"
                      />
                      <Form.Control.Feedback type="invalid">
                        {errors.warrantyMonths}
                      </Form.Control.Feedback>
                      <Form.Text className="text-muted">
                        Enter 0 if no warranty
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>

                {/* Warranty Expiry Preview */}
                {calculateWarrantyExpiry() && (
                  <Alert variant="info">
                    <strong>Warranty Expiry Date:</strong> {calculateWarrantyExpiry()}
                  </Alert>
                )}

                {/* Action Buttons */}
                <div className="d-grid gap-2 d-md-flex justify-content-md-end mt-4">
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
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-2"
                        />
                        Creating...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-save me-2"></i>
                        Create Receipt
                      </>
                    )}
                  </Button>
                </div>
              </Form>

              <Alert variant="secondary" className="mt-4 mb-0">
                <small>
                  <strong>Tip:</strong> All information will be securely encrypted before storage. 
                  You can also <Button variant="link" className="p-0" onClick={() => navigate('/receipt/upload')}>
                    upload a receipt file
                  </Button> for automatic data extraction.
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
