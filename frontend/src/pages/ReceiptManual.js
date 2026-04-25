/**
 * File: ReceiptManual.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Card, Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap';
import { createManualReceipt } from '../services/api';
import TagSelector from '../components/TagSelector';

/**
 * ReceiptManual Page
 * Allows users to manually enter receipt information without uploading a file.
 * Supports multiple line items, optional notes, and category tags.
 */
function ReceiptManual() {
  const navigate = useNavigate();

  const [header, setHeader] = useState({ storeName: '', purchaseDate: '', warrantyMonths: '12' });
  const [items, setItems] = useState([{ productDescription: '', price: '', warrantyMonths: '12' }]);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleHeaderChange = (e) => {
    const { name, value } = e.target;
    setHeader(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    const errorKey = `item_${index}_${field}`;
    if (errors[errorKey]) setErrors(prev => ({ ...prev, [errorKey]: '' }));
  };

  const handleAddItem = () => setItems(prev => [...prev, { productDescription: '', price: '', warrantyMonths: '12' }]);

  const handleRemoveItem = (index) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotal = () =>
    items.reduce((sum, item) => { const p = parseFloat(item.price); return sum + (isNaN(p) ? 0 : p); }, 0);

  const calculateWarrantyExpiry = (purchaseDate, warrantyMonths) => {
    if (!purchaseDate || !warrantyMonths) return null;
    const date = new Date(purchaseDate);
    const months = parseInt(warrantyMonths, 10);
    if (isNaN(months)) return null;
    date.setMonth(date.getMonth() + months);
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const validateForm = () => {
    const newErrors = {};
    if (!header.storeName.trim()) newErrors.storeName = 'Store name is required';
    else if (header.storeName.trim().length < 2) newErrors.storeName = 'Store name must be at least 2 characters';
    if (!header.purchaseDate) newErrors.purchaseDate = 'Purchase date is required';
    else if (new Date(header.purchaseDate) > new Date()) newErrors.purchaseDate = 'Purchase date cannot be in the future';
    const hWarranty = parseInt(header.warrantyMonths, 10);
    if (isNaN(hWarranty) || hWarranty < 0 || hWarranty > 120) newErrors.warrantyMonths = 'Warranty must be 0–120 months';

    items.forEach((item, index) => {
      if (!item.productDescription.trim()) newErrors[`item_${index}_productDescription`] = 'Description is required';
      else if (item.productDescription.trim().length < 3) newErrors[`item_${index}_productDescription`] = 'Must be at least 3 characters';
      if (item.price === '' || item.price === undefined) newErrors[`item_${index}_price`] = 'Price is required';
      else if (isNaN(parseFloat(item.price)) || parseFloat(item.price) < 0) newErrors[`item_${index}_price`] = 'Enter a valid positive number';
      const iWarranty = parseInt(item.warrantyMonths, 10);
      if (isNaN(iWarranty) || iWarranty < 0 || iWarranty > 120) newErrors[`item_${index}_warrantyMonths`] = 'Must be 0–120';
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    setError('');
    try {
      await createManualReceipt({
        storeName: header.storeName.trim(),
        purchaseDate: header.purchaseDate,
        totalPrice: calculateTotal(),
        warrantyMonths: parseInt(header.warrantyMonths, 10),
        items: items.map(item => ({
          productDescription: item.productDescription.trim(),
          price: parseFloat(item.price) || 0,
          warrantyMonths: parseInt(item.warrantyMonths, 10) || 12
        })),
        notes: notes.trim(),
        tags
      });
      setSuccess(true);
      setTimeout(() => navigate('/receipts'), 1500);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.limitReached) {
        setError(`Storage limit reached: ${errData.error}`);
      } else {
        setError(errData?.error || 'Failed to create receipt. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setHeader({ storeName: '', purchaseDate: '', warrantyMonths: '12' });
    setItems([{ productDescription: '', price: '', warrantyMonths: '12' }]);
    setNotes('');
    setTags([]);
    setErrors({});
    setError('');
  };

  return (
    <Container className="mt-0">
      <div className="row justify-content-center">
        <div className="col-lg-9">
          <Card>
            <Card.Header className="bg-primary text-white"><h4 className="mb-0">Add Receipt Manually</h4></Card.Header>
            <Card.Body>
              {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
              {success && <Alert variant="success"><strong>Success!</strong> Receipt created. Redirecting...</Alert>}

              <Form noValidate onSubmit={handleSubmit}>

                {/* Receipt header */}
                <h5 className="mb-3">Receipt Details</h5>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Store Name <span className="text-danger">*</span></Form.Label>
                      <Form.Control type="text" name="storeName" value={header.storeName}
                        onChange={handleHeaderChange} isInvalid={!!errors.storeName}
                        disabled={submitting} placeholder="e.g. IKEA, Apple Store" />
                      <Form.Control.Feedback type="invalid">{errors.storeName}</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Purchase Date <span className="text-danger">*</span></Form.Label>
                      <Form.Control type="date" name="purchaseDate" value={header.purchaseDate}
                        onChange={handleHeaderChange} isInvalid={!!errors.purchaseDate}
                        disabled={submitting} max={new Date().toISOString().split('T')[0]} />
                      <Form.Control.Feedback type="invalid">{errors.purchaseDate}</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <hr className="my-4" />

                {/* Items */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0">Items</h5>
                  <Button variant="outline-primary" size="sm" onClick={handleAddItem} disabled={submitting}>+ Add Item</Button>
                </div>

                {items.map((item, index) => (
                  <Card key={index} className="mb-3 bg-light">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <strong>Item {index + 1}</strong>
                        {items.length > 1 && (
                          <Button variant="outline-danger" size="sm" onClick={() => handleRemoveItem(index)} disabled={submitting}>Remove</Button>
                        )}
                      </div>
                      <Form.Group className="mb-3">
                        <Form.Label>Product Description <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="text" value={item.productDescription}
                          onChange={(e) => handleItemChange(index, 'productDescription', e.target.value)}
                          isInvalid={!!errors[`item_${index}_productDescription`]} disabled={submitting} />
                        <Form.Control.Feedback type="invalid">{errors[`item_${index}_productDescription`]}</Form.Control.Feedback>
                      </Form.Group>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>Price (€) <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="number" step="0.01" min="0" value={item.price}
                              onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                              isInvalid={!!errors[`item_${index}_price`]} disabled={submitting} placeholder="0.00" />
                            <Form.Control.Feedback type="invalid">{errors[`item_${index}_price`]}</Form.Control.Feedback>
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>Warranty (months)</Form.Label>
                            <Form.Control type="number" min="0" max="120" value={item.warrantyMonths}
                              onChange={(e) => handleItemChange(index, 'warrantyMonths', e.target.value)}
                              isInvalid={!!errors[`item_${index}_warrantyMonths`]} disabled={submitting} />
                            <Form.Control.Feedback type="invalid">{errors[`item_${index}_warrantyMonths`]}</Form.Control.Feedback>
                          </Form.Group>
                        </Col>
                      </Row>
                      {calculateWarrantyExpiry(header.purchaseDate, item.warrantyMonths) && (
                        <small className="text-muted">
                          Warranty expires: <strong>{calculateWarrantyExpiry(header.purchaseDate, item.warrantyMonths)}</strong>
                        </small>
                      )}
                    </Card.Body>
                  </Card>
                ))}

                {items.length > 1 && (
                  <Alert variant="info" className="mt-2">
                    <strong>Calculated Total: €{calculateTotal().toFixed(2)}</strong> ({items.length} items)
                  </Alert>
                )}

                <hr className="my-4" />

                {/* Notes */}
                <Form.Group className="mb-3">
                  <Form.Label>Notes <small className="text-muted">(optional)</small></Form.Label>
                  <Form.Control as="textarea" rows={2} value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional notes about this purchase..."
                    maxLength={1000} disabled={submitting} />
                  <Form.Text className="text-muted">{notes.length}/1000</Form.Text>
                </Form.Group>

                {/* Tags */}
                <Form.Group className="mb-4">
                  <Form.Label>Tags <small className="text-muted">(optional)</small></Form.Label>
                  <TagSelector selectedTags={tags} onChange={setTags} disabled={submitting} />
                </Form.Group>

                <hr className="my-4" />

                <div className="d-flex justify-content-end gap-2">
                  <Button variant="outline-secondary" onClick={() => navigate('/receipts')} disabled={submitting}>Cancel</Button>
                  <Button variant="outline-danger" onClick={handleReset} disabled={submitting}>Reset Form</Button>
                  <Button variant="primary" type="submit" disabled={submitting}>
                    {submitting ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Creating...</> : 'Create Receipt'}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </div>
      </div>
    </Container>
  );
}

export default ReceiptManual;