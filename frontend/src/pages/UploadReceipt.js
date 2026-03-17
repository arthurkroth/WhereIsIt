/**
 * File: UploadReceipt.js
 * Author: Arthur Kroth - x22166971
 * Date: 11/02/2026
 * WhereIsIt Project
 */

import React, { useState } from 'react';
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Alert,
  Spinner,
  Tabs,
  Tab,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { uploadReceipt, createManualReceipt } from '../services/api';

/**
 * Upload Receipt page component.
 * Provides two methods for adding receipts:
 * 1. File upload with OCR extraction
 * 2. Manual entry
 * 
 * SECURITY NOTES:
 * - File type validation (client-side and server-side)
 * - File size limits enforced
 * - Input sanitization through form validation
 * - Multipart form data for secure file upload
 */
const UploadReceipt = () => {
  const navigate = useNavigate();
  
  // File upload state
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  
  // Manual entry state
  const [manualData, setManualData] = useState({
    storeName: '',
    purchaseDate: '',
    productDescription: '',
    pricePaid: '',
    warrantyMonths: '',
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [extractedData, setExtractedData] = useState(null);
  const [validated, setValidated] = useState(false);

  // Tab control
  const [activeTab, setActiveTab] = useState('upload');

  /**
   * Validates file type and size.
   * @param {File} file - File to validate
   * @returns {Object} Validation result
   */
  const validateFile = (file) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: 'Invalid file type. Please upload a PNG, JPEG, or PDF file.',
      };
    }

    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'File size exceeds 10MB limit.',
      };
    }

    return { valid: true };
  };

  /**
   * Handles file selection and creates preview.
   */
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    if (!selectedFile) {
      setFile(null);
      setFilePreview(null);
      return;
    }

    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error);
      setFile(null);
      setFilePreview(null);
      return;
    }

    setFile(selectedFile);
    setError('');

    // Create preview for images
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setFilePreview(null);
    }
  };

  /**
   * Handles file upload submission.
   */
  const handleUploadSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await uploadReceipt(file);
      
      // Show extracted data
      setExtractedData(response.data.extracted);
      setSuccess(
        `Receipt uploaded successfully! ID: ${response.data.receiptId}. Extracted data is shown below.`
      );
      
      // Clear form
      setFile(null);
      setFilePreview(null);
      
      // Reset file input
      e.target.reset();
    } catch (err) {
      if (err.response?.status === 400) {
        setError('Invalid file or data. Please check your upload.');
      } else {
        setError('Failed to upload receipt. Please try again.');
      }
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles manual entry form changes.
   */
  const handleManualChange = (field, value) => {
    setManualData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /**
   * Validates manual entry data.
   * @returns {Object} Validation result
   */
  const validateManualData = () => {
    const errors = [];

    if (!manualData.storeName.trim()) {
      errors.push('Store name is required');
    }

    if (!manualData.purchaseDate) {
      errors.push('Purchase date is required');
    }

    if (!manualData.productDescription.trim()) {
      errors.push('Product description is required');
    }

    const price = parseFloat(manualData.pricePaid);
    if (isNaN(price) || price < 0) {
      errors.push('Price must be a valid positive number');
    }

    const warranty = parseInt(manualData.warrantyMonths);
    if (isNaN(warranty) || warranty < 0) {
      errors.push('Warranty months must be a valid non-negative number');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  };

  /**
   * Handles manual entry submission.
   */
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setValidated(true);

    const validation = validateManualData();
    if (!validation.valid) {
      setError(validation.errors.join('. '));
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await createManualReceipt({
        storeName: manualData.storeName,
        purchaseDate: manualData.purchaseDate,
        productDescription: manualData.productDescription,
        pricePaid: parseFloat(manualData.pricePaid),
        warrantyMonths: parseInt(manualData.warrantyMonths),
      });

      setSuccess(`Receipt created successfully! ID: ${response.data.receiptId}`);
      
      // Clear form
      setManualData({
        storeName: '',
        purchaseDate: '',
        productDescription: '',
        pricePaid: '',
        warrantyMonths: '',
      });
      setValidated(false);
    } catch (err) {
      setError('Failed to create receipt. Please try again.');
      console.error('Manual creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="main-container">
      <h1 className="mb-4">Add Receipt</h1>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess('')}>
          {success}
          <div className="mt-2">
            <Button size="sm" variant="outline-success" onClick={() => navigate('/receipts')}>
              View All Receipts
            </Button>
          </div>
        </Alert>
      )}

      <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k)} className="mb-3">
        {/* File Upload Tab */}
        <Tab eventKey="upload" title="Upload Receipt">
          <Card>
            <Card.Body>
              <h5 className="mb-3">Upload Receipt Image or PDF</h5>
              <p className="text-muted">
                Upload a photo or scan of your receipt. Our system will automatically extract the
                purchase details using OCR.
              </p>

              <Form onSubmit={handleUploadSubmit}>
                <Form.Group className="mb-3" controlId="formFile">
                  <Form.Label>Select Receipt File</Form.Label>
                  <Form.Control
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,application/pdf"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                  <Form.Text className="text-muted">
                    Accepted formats: PNG, JPEG, PDF (Max size: 10MB)
                  </Form.Text>
                </Form.Group>

                {filePreview && (
                  <div className="mb-3">
                    <p className="mb-2">Preview:</p>
                    <img
                      src={filePreview}
                      alt="Receipt preview"
                      style={{ maxWidth: '100%', maxHeight: '300px' }}
                      className="border rounded"
                    />
                  </div>
                )}

                <Button variant="primary" type="submit" disabled={!file || loading}>
                  {loading ? (
                    <>
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                        className="me-2"
                      />
                      Processing...
                    </>
                  ) : (
                    'Upload and Extract'
                  )}
                </Button>
              </Form>

              {extractedData && (
                <Alert variant="info" className="mt-3">
                  <h6>Extracted Data:</h6>
                  <ul className="mb-0">
                    <li>Store: {extractedData.storeName}</li>
                    <li>Date: {extractedData.purchaseDate}</li>
                    <li>Product: {extractedData.productDescription}</li>
                    <li>Price: €{extractedData.pricePaid}</li>
                    <li>Warranty: {extractedData.warrantyMonths} months</li>
                  </ul>
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Tab>

        {/* Manual Entry Tab */}
        <Tab eventKey="manual" title="Manual Entry">
          <Card>
            <Card.Body>
              <h5 className="mb-3">Enter Receipt Details Manually</h5>
              <p className="text-muted">
                If you don't have a digital copy of your receipt, you can enter the details manually.
              </p>

              <Form noValidate validated={validated} onSubmit={handleManualSubmit}>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3" controlId="storeName">
                      <Form.Label>Store Name *</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="e.g., Best Buy"
                        value={manualData.storeName}
                        onChange={(e) => handleManualChange('storeName', e.target.value)}
                        required
                        disabled={loading}
                      />
                      <Form.Control.Feedback type="invalid">
                        Store name is required
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3" controlId="purchaseDate">
                      <Form.Label>Purchase Date *</Form.Label>
                      <Form.Control
                        type="date"
                        value={manualData.purchaseDate}
                        onChange={(e) => handleManualChange('purchaseDate', e.target.value)}
                        required
                        disabled={loading}
                      />
                      <Form.Control.Feedback type="invalid">
                        Purchase date is required
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3" controlId="productDescription">
                  <Form.Label>Product Description *</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g., Samsung 55-inch Smart TV"
                    value={manualData.productDescription}
                    onChange={(e) => handleManualChange('productDescription', e.target.value)}
                    required
                    disabled={loading}
                  />
                  <Form.Control.Feedback type="invalid">
                    Product description is required
                  </Form.Control.Feedback>
                </Form.Group>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3" controlId="pricePaid">
                      <Form.Label>Price Paid (€) *</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={manualData.pricePaid}
                        onChange={(e) => handleManualChange('pricePaid', e.target.value)}
                        required
                        disabled={loading}
                      />
                      <Form.Control.Feedback type="invalid">
                        Price must be a positive number
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3" controlId="warrantyMonths">
                      <Form.Label>Warranty Duration (months) *</Form.Label>
                      <Form.Control
                        type="number"
                        min="0"
                        placeholder="12"
                        value={manualData.warrantyMonths}
                        onChange={(e) => handleManualChange('warrantyMonths', e.target.value)}
                        required
                        disabled={loading}
                      />
                      <Form.Control.Feedback type="invalid">
                        Warranty must be a non-negative number
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                </Row>

                <Button variant="primary" type="submit" disabled={loading}>
                  {loading ? (
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
                    'Create Receipt'
                  )}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>
    </Container>
  );
};

export default UploadReceipt;