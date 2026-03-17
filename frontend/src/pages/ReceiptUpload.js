/**
 * File: ReceiptUpload.js
 * Author: Arthur Kroth - x22166971
 * Date: 17/03/2026
 * WhereIsIt Project
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Card, Form, Button, Alert,
  Spinner, ProgressBar, Row, Col, Badge
} from 'react-bootstrap';
import { uploadReceipt } from '../services/api';
import api from '../services/api';

/**
 * ReceiptUpload Page
 * Allows users to upload receipt images or PDFs for automatic OCR processing.
 *
 * WORKFLOW:
 * Step 1 - File selection and upload
 * Step 2 - Review and correct the OCR-extracted data before saving
 * Step 3 - Confirmed data is saved and user is redirected to receipts list
 *
 * FEATURES:
 * - Drag-and-drop file upload
 * - Client-side file validation (type, size)
 * - Preview of selected image
 * - OCR processing with progress bar
 * - Editable review step so users can fix incorrect OCR results
 *
 * SECURITY:
 * - File type validation (PNG, JPEG, PDF only)
 * - File size limit enforcement (matches backend limit)
 * - Server-side validation as final check
 */
function ReceiptUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // File selection state
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Upload/processing state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  // After OCR - review step state
  // When this is set, we show the review form instead of the upload form
  const [receiptId, setReceiptId] = useState(null);
  const [ocrSuccess, setOcrSuccess] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  /**
   * Validates a file's type and size before upload.
   * @param {File} file - File to validate
   * @returns {object} Validation result {valid: boolean, error: string}
   */
  const validateFile = (file) => {
    if (!file) return { valid: false, error: 'No file selected' };

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { valid: false, error: 'Invalid file type. Please upload PNG, JPEG, or PDF files only.' };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.` };
    }

    return { valid: true, error: null };
  };

  /**
   * Handles file selection from the input or drag-and-drop.
   * Creates a preview URL for image files.
   * @param {File} file - Selected file
   */
  const handleFileSelect = (file) => {
    const validation = validateFile(file);

    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setError('');
    setSelectedFile(file);
    setReviewData(null);
    setReceiptId(null);

    // Create a preview URL for image files only (not PDFs)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result);
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  };

  /**
   * Handles the file input change event.
   * @param {Event} e - Change event from file input
   */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  /**
   * Handles drag events for the drop zone (enter, over, leave).
   * @param {Event} e - Drag event
   */
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  /**
   * Handles file drop on the drop zone.
   * @param {Event} e - Drop event
   */
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  /**
   * Handles the upload form submission.
   * Uploads the file to the backend, runs OCR, then shows the review step.
   * @param {Event} e - Submit event
   */
  const handleUploadSubmit = async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      // Simulate upload progress while waiting for the server
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 5, 90));
      }, 300);

      const response = await uploadReceipt(selectedFile);

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Store the receipt ID and OCR results for the review step
      const data = response.data;
      setReceiptId(data.receiptId);
      setOcrSuccess(data.ocrSuccess);

      // Pre-populate the review form with whatever OCR extracted
      setReviewData({
        storeName: data.extractedData?.storeName || '',
        purchaseDate: data.extractedData?.purchaseDate || new Date().toISOString().split('T')[0],
        productDescription: data.extractedData?.productDescription || '',
        price: data.extractedData?.price || '',
        warrantyMonths: data.extractedData?.warrantyMonths || 12
      });

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload receipt. Please try again.');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  /**
   * Handles changes to the review form fields.
   * @param {string} field - Field name to update
   * @param {string} value - New value
   */
  const handleReviewChange = (field, value) => {
    setReviewData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * Saves the reviewed/corrected receipt data to the backend.
   * Calls the PUT /receipts/:id endpoint with the confirmed data.
   */
  const handleSaveConfirmed = async () => {
    setSaving(true);
    setError('');

    try {
      await api.put(`/receipts/${receiptId}`, {
        storeName: reviewData.storeName,
        purchaseDate: reviewData.purchaseDate,
        productDescription: reviewData.productDescription,
        price: parseFloat(reviewData.price) || 0,
        warrantyMonths: parseInt(reviewData.warrantyMonths) || 12
      });

      setSaveSuccess(true);

      // Redirect to receipts list after a short delay
      setTimeout(() => navigate('/receipts'), 1500);

    } catch (err) {
      setError('Failed to save receipt. Please try again.');
      console.error('Save confirmed error:', err);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Resets the entire form back to the file selection step.
   * Called when the user clicks "Upload Another".
   */
  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setReviewData(null);
    setReceiptId(null);
    setError('');
    setUploadProgress(0);
    setSaveSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ============================================================
  // STEP 2: Review Step - shown after successful OCR processing
  // ============================================================
  if (reviewData) {
    return (
      <Container className="mt-4">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <Card>
              <Card.Header className="bg-primary text-white">
                <h4 className="mb-0">Review Extracted Information</h4>
              </Card.Header>
              <Card.Body>

                {/* OCR quality notice */}
                {ocrSuccess ? (
                  <Alert variant="info" className="mb-4">
                    <strong>OCR completed.</strong> The information below was automatically extracted
                    from your receipt. Please review and correct any errors before saving —
                    OCR is not always perfect, especially with handwritten or low-quality images.
                  </Alert>
                ) : (
                  <Alert variant="warning" className="mb-4">
                    <strong>OCR had difficulty reading this receipt.</strong> The fields below may be
                    incomplete or inaccurate. Please fill them in manually before saving.
                  </Alert>
                )}

                {error && (
                  <Alert variant="danger" onClose={() => setError('')} dismissible>
                    {error}
                  </Alert>
                )}

                {saveSuccess && (
                  <Alert variant="success">
                    <strong>Receipt saved!</strong> Redirecting to your receipts...
                  </Alert>
                )}

                {/* Review / edit form */}
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Store Name <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        value={reviewData.storeName}
                        onChange={(e) => handleReviewChange('storeName', e.target.value)}
                        placeholder="e.g. DID Electrical"
                        disabled={saving || saveSuccess}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Purchase Date <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={reviewData.purchaseDate}
                        onChange={(e) => handleReviewChange('purchaseDate', e.target.value)}
                        disabled={saving || saveSuccess}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3">
                  <Form.Label>
                    Product Description <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    value={reviewData.productDescription}
                    onChange={(e) => handleReviewChange('productDescription', e.target.value)}
                    placeholder="e.g. Samsung 55-inch Smart TV"
                    disabled={saving || saveSuccess}
                  />
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
                        value={reviewData.price}
                        onChange={(e) => handleReviewChange('price', e.target.value)}
                        placeholder="0.00"
                        disabled={saving || saveSuccess}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Warranty Duration (months)</Form.Label>
                      <Form.Control
                        type="number"
                        min="0"
                        value={reviewData.warrantyMonths}
                        onChange={(e) => handleReviewChange('warrantyMonths', e.target.value)}
                        disabled={saving || saveSuccess}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                {/* Action buttons */}
                <div className="d-flex justify-content-between mt-3">
                  <Button
                    variant="outline-secondary"
                    onClick={handleReset}
                    disabled={saving || saveSuccess}
                  >
                    ← Upload Different Receipt
                  </Button>
                  <Button
                    variant="success"
                    onClick={handleSaveConfirmed}
                    disabled={saving || saveSuccess || !reviewData.storeName || !reviewData.productDescription}
                  >
                    {saving ? (
                      <>
                        <Spinner as="span" animation="border" size="sm" className="me-2" />
                        Saving...
                      </>
                    ) : (
                      'Confirm and Save Receipt'
                    )}
                  </Button>
                </div>

              </Card.Body>
            </Card>
          </div>
        </div>
      </Container>
    );
  }

  // ============================================================
  // STEP 1: Upload Step - file selection and upload
  // ============================================================
  return (
    <Container className="mt-4">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <Card>
            <Card.Header className="bg-primary text-white">
              <h4 className="mb-0">Upload Receipt</h4>
            </Card.Header>
            <Card.Body>

              {error && (
                <Alert variant="danger" onClose={() => setError('')} dismissible>
                  {error}
                </Alert>
              )}

              <Form onSubmit={handleUploadSubmit}>

                {/* Drag and drop zone */}
                <div
                  className={`border rounded p-5 text-center mb-3 ${
                    dragActive ? 'border-primary bg-light' : 'border-secondary'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <h5 className="mt-3">
                    {selectedFile ? selectedFile.name : 'Drag and drop your receipt here'}
                  </h5>
                  <p className="text-muted">or click to browse files</p>
                  <p className="text-muted small mb-0">
                    Supported formats: PNG, JPEG, PDF (max {MAX_FILE_SIZE / 1024 / 1024}MB)
                  </p>

                  <Form.Control
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.pdf"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="d-none"
                  />
                </div>

                {/* Image preview */}
                {previewUrl && (
                  <div className="text-center mb-3">
                    <img
                      src={previewUrl}
                      alt="Receipt preview"
                      className="img-fluid rounded"
                      style={{ maxHeight: '300px' }}
                    />
                  </div>
                )}

                {/* Selected file info */}
                {selectedFile && (
                  <Card className="mb-3 bg-light">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong>Selected file:</strong> {selectedFile.name}
                          <br />
                          <small className="text-muted">
                            Size: {(selectedFile.size / 1024).toFixed(2)} KB | Type: {selectedFile.type}
                          </small>
                        </div>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={handleReset}
                          disabled={uploading}
                        >
                          Remove
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                )}

                {/* Upload progress bar */}
                {uploading && (
                  <div className="mb-3">
                    <ProgressBar
                      now={uploadProgress}
                      label={`${uploadProgress}%`}
                      animated
                      striped
                    />
                    <p className="text-center mt-2 text-muted">
                      <Spinner animation="border" size="sm" className="me-2" />
                      {uploadProgress < 90 ? 'Uploading...' : 'Running OCR, this may take a moment...'}
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                  <Button
                    variant="outline-secondary"
                    onClick={() => navigate('/receipts')}
                    disabled={uploading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!selectedFile || uploading}
                  >
                    {uploading ? (
                      <>
                        <Spinner as="span" animation="border" size="sm" className="me-2" />
                        Processing...
                      </>
                    ) : (
                      'Upload and Process'
                    )}
                  </Button>
                </div>
              </Form>

              <Alert variant="info" className="mt-3 mb-0">
                <small>
                  <strong>Note:</strong> After uploading, our OCR system will automatically extract
                  purchase details from your receipt. You will be able to review and correct the
                  information before it is saved.
                </small>
              </Alert>

            </Card.Body>
          </Card>
        </div>
      </div>
    </Container>
  );
}

export default ReceiptUpload;