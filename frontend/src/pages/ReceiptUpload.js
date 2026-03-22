/**
 * File: ReceiptUpload.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Card, Form, Button, Alert,
  Spinner, ProgressBar, Row, Col
} from 'react-bootstrap';
import { uploadReceipt } from '../services/api';
import api from '../services/api';

/**
 * ReceiptUpload Page
 * Allows users to upload receipt images or PDFs for automatic OCR processing.
 *
 * WORKFLOW:
 * Step 1 - File selection and upload
 * Step 2 - Split-screen review:
 *          LEFT  — editable form with extracted data (store, date, total, items)
 *          RIGHT — the original receipt image/PDF with zoom in/out controls
 *          This allows the user to look at the receipt and correct the form
 *          without switching back and forth between pages.
 * Step 3 - Confirmed data is saved and user is redirected to receipts list.
 *
 * FEATURES:
 * - Drag-and-drop file upload
 * - Client-side file validation (type, size)
 * - Preview of selected image
 * - OCR processing with progress bar
 * - Split-screen review with receipt preview and zoom controls
 * - Multi-item support with add/remove
 * - Total price field visible and editable in review step
 *
 * SECURITY:
 * - File type validation (PNG, JPEG, PDF only)
 * - File size limit enforcement (matches backend limit)
 * - Server-side validation as final check
 */
function ReceiptUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Step 1: File selection state
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Upload/processing state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  // Step 2: Review step state
  const [receiptId, setReceiptId] = useState(null);
  const [ocrSuccess, setOcrSuccess] = useState(false);
  const [reviewHeader, setReviewHeader] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);

  // Receipt preview state for the right panel
  // fileUrl holds the blob URL for the uploaded receipt (image or PDF)
  const [fileUrl, setFileUrl] = useState(null);
  const [isPdf, setIsPdf] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MIN_ZOOM = 50;
  const MAX_ZOOM = 300;
  const ZOOM_STEP = 25;

  /**
   * Fetches the uploaded receipt file as a blob URL when the review step opens.
   * We use a blob URL to avoid cross-origin issues with <img> and <embed> tags
   * when the backend is on a different port from the frontend.
   */
  useEffect(() => {
    if (!receiptId) return;

    const fetchReceiptFile = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `http://localhost:3001/receipts/${receiptId}/file`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) return;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setFileUrl(url);
      } catch (err) {
        console.error('Failed to load receipt preview:', err);
      }
    };

    fetchReceiptFile();

    // Cleanup blob URL when component unmounts or receiptId changes
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [receiptId]);

  /**
   * Validates a file's type and size before upload.
   * @param {File} file - File to validate
   * @returns {Object} {valid: boolean, error: string}
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
    setReviewHeader(null);
    setReviewItems([]);
    setReceiptId(null);
    setFileUrl(null);

    // Detect file type for the preview panel
    setIsPdf(file.type === 'application/pdf');

    // Create a local preview URL for image files only (not PDFs)
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
   * @param {Event} e - Change event
   */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  /**
   * Handles drag events for the drop zone.
   * @param {Event} e - Drag event
   */
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
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
   * Sends the file to the backend, waits for OCR, then shows the review step.
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
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 5, 90));
      }, 300);

      const response = await uploadReceipt(selectedFile);
      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = response.data;
      setReceiptId(data.receiptId);
      setOcrSuccess(data.ocrSuccess);

      // Populate review form from OCR results
      setReviewHeader({
        storeName: data.extractedData?.storeName || '',
        purchaseDate: data.extractedData?.purchaseDate || new Date().toISOString().split('T')[0],
        totalPrice: data.extractedData?.totalPrice || '',
        warrantyMonths: data.extractedData?.warrantyMonths || 12
      });

      setReviewItems(
        data.extractedData?.items?.length > 0
          ? data.extractedData.items
          : [{ productDescription: '', price: '', warrantyMonths: 12 }]
      );

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload receipt. Please try again.');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  /**
   * Handles changes to the review header fields.
   * @param {string} field - Field name
   * @param {string} value - New value
   */
  const handleHeaderChange = (field, value) => {
    setReviewHeader(prev => ({ ...prev, [field]: value }));
  };

  /**
   * Handles changes to a specific item in the review items list.
   * @param {number} index - Item index
   * @param {string} field - Field name
   * @param {string} value - New value
   */
  const handleItemChange = (index, field, value) => {
    setReviewItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  /**
   * Adds a new blank item row to the review items list.
   */
  const handleAddItem = () => {
    setReviewItems(prev => [
      ...prev,
      { productDescription: '', price: '', warrantyMonths: 12 }
    ]);
  };

  /**
   * Removes an item from the review items list.
   * Always keeps at least one item row.
   * @param {number} index - Index of the item to remove
   */
  const handleRemoveItem = (index) => {
    if (reviewItems.length === 1) return;
    setReviewItems(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Increases the zoom level of the receipt preview by one step.
   */
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  };

  /**
   * Decreases the zoom level of the receipt preview by one step.
   */
  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  };

  /**
   * Resets the zoom level back to 100%.
   */
  const handleZoomReset = () => {
    setZoomLevel(100);
  };

  /**
   * Saves the confirmed receipt data to the backend via PUT /receipts/:id.
   */
  const handleSaveConfirmed = async () => {
    setSaving(true);
    setError('');

    try {
      await api.put(`/receipts/${receiptId}`, {
        storeName: reviewHeader.storeName,
        purchaseDate: reviewHeader.purchaseDate,
        totalPrice: parseFloat(reviewHeader.totalPrice) || 0,
        warrantyMonths: parseInt(reviewHeader.warrantyMonths) || 12,
        items: reviewItems.map(item => ({
          productDescription: item.productDescription,
          price: parseFloat(item.price) || 0,
          warrantyMonths: parseInt(item.warrantyMonths) || 12
        }))
      });

      setSaveSuccess(true);
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
   */
  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setReviewHeader(null);
    setReviewItems([]);
    setReceiptId(null);
    setFileUrl(null);
    setZoomLevel(100);
    setError('');
    setUploadProgress(0);
    setSaveSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ============================================================
  // STEP 2: Split-screen review step
  // ============================================================
  if (reviewHeader) {
    return (
      <Container fluid className="px-4">

        {/* Page header row */}
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 className="mb-0">Review Extracted Information</h4>
          <div className="d-flex gap-2">
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
              disabled={saving || saveSuccess || !reviewHeader.storeName}
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
        </div>

        {/* OCR quality notice */}
        {ocrSuccess ? (
          <Alert variant="info" className="mb-3">
            <strong>OCR completed.</strong> The information on the left was automatically
            extracted from your receipt. Use the receipt preview on the right to verify
            and correct any errors before saving.
          </Alert>
        ) : (
          <Alert variant="warning" className="mb-3">
            <strong>OCR had difficulty reading this receipt.</strong> Please fill in
            the fields manually using the receipt preview on the right as a guide.
          </Alert>
        )}

        {error && (
          <Alert variant="danger" onClose={() => setError('')} dismissible className="mb-3">
            {error}
          </Alert>
        )}

        {saveSuccess && (
          <Alert variant="success" className="mb-3">
            <strong>Receipt saved!</strong> Redirecting to your receipts...
          </Alert>
        )}

        {/* Split-screen layout */}
        <Row className="g-3" style={{ minHeight: '75vh' }}>

          {/* ── LEFT PANEL: Edit form ──────────────────────────────────── */}
          <Col md={6} lg={5}>
            <Card className="h-100">
              <Card.Header className="bg-primary text-white">
                <strong>Receipt Details</strong>
              </Card.Header>
              <Card.Body style={{ overflowY: 'auto', maxHeight: 'calc(75vh - 56px)' }}>

                {/* Header fields */}
                <Form.Group className="mb-3">
                  <Form.Label>Store Name <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    value={reviewHeader.storeName}
                    onChange={(e) => handleHeaderChange('storeName', e.target.value)}
                    placeholder="e.g. DID Electrical"
                    disabled={saving || saveSuccess}
                  />
                </Form.Group>

                <Row className="mb-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Purchase Date <span className="text-danger">*</span></Form.Label>
                      <Form.Control
                        type="date"
                        value={reviewHeader.purchaseDate}
                        onChange={(e) => handleHeaderChange('purchaseDate', e.target.value)}
                        disabled={saving || saveSuccess}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Total Price (€)</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.01"
                        min="0"
                        value={reviewHeader.totalPrice}
                        onChange={(e) => handleHeaderChange('totalPrice', e.target.value)}
                        placeholder="0.00"
                        disabled={saving || saveSuccess}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <hr />

                {/* Items section */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <strong>Items ({reviewItems.length})</strong>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleAddItem}
                    disabled={saving || saveSuccess}
                  >
                    + Add Item
                  </Button>
                </div>

                {reviewItems.map((item, index) => (
                  <Card key={index} className="mb-3 bg-light border">
                    <Card.Body className="py-2 px-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <small><strong>Item {index + 1}</strong></small>
                        {reviewItems.length > 1 && (
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                            disabled={saving || saveSuccess}
                          >
                            Remove
                          </Button>
                        )}
                      </div>

                      <Form.Group className="mb-2">
                        <Form.Label className="small mb-1">
                          Description <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          type="text"
                          size="sm"
                          value={item.productDescription}
                          onChange={(e) => handleItemChange(index, 'productDescription', e.target.value)}
                          placeholder="e.g. Nespresso Vertuo Pop"
                          disabled={saving || saveSuccess}
                        />
                      </Form.Group>

                      <Row>
                        <Col xs={6}>
                          <Form.Group>
                            <Form.Label className="small mb-1">Price (€)</Form.Label>
                            <Form.Control
                              type="number"
                              size="sm"
                              step="0.01"
                              min="0"
                              value={item.price}
                              onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                              placeholder="0.00"
                              disabled={saving || saveSuccess}
                            />
                          </Form.Group>
                        </Col>
                        <Col xs={6}>
                          <Form.Group>
                            <Form.Label className="small mb-1">Warranty (months)</Form.Label>
                            <Form.Control
                              type="number"
                              size="sm"
                              min="0"
                              max="120"
                              value={item.warrantyMonths}
                              onChange={(e) => handleItemChange(index, 'warrantyMonths', e.target.value)}
                              disabled={saving || saveSuccess}
                            />
                          </Form.Group>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                ))}

              </Card.Body>
            </Card>
          </Col>

          {/* ── RIGHT PANEL: Receipt preview with zoom ─────────────────── */}
          <Col md={6} lg={7}>
            <Card className="h-100">
              <Card.Header className="bg-secondary text-white d-flex justify-content-between align-items-center">
                <strong>{isPdf ? 'Receipt PDF' : 'Receipt Image'}</strong>

                {/* Zoom controls */}
                <div className="d-flex align-items-center gap-2">
                  <Button
                    variant="outline-light"
                    size="sm"
                    onClick={handleZoomOut}
                    disabled={zoomLevel <= MIN_ZOOM}
                    title="Zoom out"
                  >
                    −
                  </Button>
                  <span className="text-white small" style={{ minWidth: '45px', textAlign: 'center' }}>
                    {zoomLevel}%
                  </span>
                  <Button
                    variant="outline-light"
                    size="sm"
                    onClick={handleZoomIn}
                    disabled={zoomLevel >= MAX_ZOOM}
                    title="Zoom in"
                  >
                    +
                  </Button>
                  <Button
                    variant="outline-light"
                    size="sm"
                    onClick={handleZoomReset}
                    title="Reset zoom"
                  >
                    ↺
                  </Button>
                </div>
              </Card.Header>

              {/* Scrollable preview area */}
              <Card.Body
                className="p-0"
                style={{
                  overflowY: 'auto',
                  overflowX: 'auto',
                  maxHeight: 'calc(75vh - 56px)',
                  backgroundColor: '#f8f9fa'
                }}
              >
                {fileUrl ? (
                  <div
                    style={{
                      width: `${zoomLevel}%`,
                      minWidth: zoomLevel > 100 ? `${zoomLevel}%` : '100%',
                      transition: 'width 0.2s ease'
                    }}
                  >
                    {isPdf ? (
                      // PDFs: use embed with parameters to hide the browser's
                      // built-in pages panel and toolbar for a cleaner view
                      <embed
                        src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                        type="application/pdf"
                        width="100%"
                        style={{
                          height: `${Math.max(600, (zoomLevel / 100) * 800)}px`,
                          display: 'block'
                        }}
                      />
                    ) : (
                      // Images: use img tag with blob URL
                      <img
                        src={fileUrl}
                        alt="Receipt"
                        style={{ width: '100%', display: 'block' }}
                      />
                    )}
                  </div>
                ) : (
                  // Still loading the file blob
                  <div className="d-flex flex-column align-items-center justify-content-center h-100 py-5">
                    <Spinner animation="border" variant="secondary" />
                    <p className="mt-3 text-muted">
                      {isPdf ? 'Loading PDF preview...' : 'Loading image preview...'}
                    </p>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

        </Row>
      </Container>
    );
  }

  // ============================================================
  // STEP 1: Upload step - file selection
  // ============================================================
  return (
    <Container className="mt-0">
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

              <Form noValidate onSubmit={handleUploadSubmit}>

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
                    <ProgressBar now={uploadProgress} label={`${uploadProgress}%`} animated striped />
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
                  <strong>Note:</strong> After uploading, our OCR system will automatically
                  extract purchase details from your receipt. You will be able to review the
                  receipt and correct the information side by side before saving.
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