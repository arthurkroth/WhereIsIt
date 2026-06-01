/**
 * ReceiptUpload Page
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * KEY CHANGES:
 * - Added aiProviderError state and notification banner
 * - When OpenAI falls back to Tesseract, a warning alert is shown in the
 *   review step telling the user that AI OCR was unavailable
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Card, Form, Button, Alert,
  Spinner, ProgressBar, Row, Col
} from 'react-bootstrap';
import { uploadReceipt } from '../services/api';
import api from '../services/api';
import TagSelector from '../components/TagSelector';

/**
 * ReceiptUpload Page
 * Handles receipt file upload, OCR processing, and the review/confirm step.
 *
 * STEP 1: File selection and upload
 * STEP 2: Split-screen review — edit form on left, receipt preview on right.
 *         Includes notes and tags fields for optional categorisation.
 *         Shows an AI provider error banner if OpenAI fell back to Tesseract.
 * STEP 3: Save confirmed data and redirect.
 */
function ReceiptUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const [receiptId, setReceiptId] = useState(null);
  const [ocrSuccess, setOcrSuccess] = useState(false);
  const [ocrMethod, setOcrMethod] = useState(null); // 'openai' | 'tesseract'
  const [aiProviderError, setAiProviderError] = useState(false);
  const [aiProviderMessage, setAiProviderMessage] = useState('');

  const [reviewHeader, setReviewHeader] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewTags, setReviewTags] = useState([]);

  const [fileUrl, setFileUrl] = useState(null);
  const [isPdf, setIsPdf] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MIN_ZOOM = 50;
  const MAX_ZOOM = 300;
  const ZOOM_STEP = 25;

  // Load receipt file preview after OCR completes
  useEffect(() => {
    if (!receiptId) return;
    const fetchFile = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`http://localhost:3001/receipts/${receiptId}/file`,
          { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const blob = await response.blob();
        setFileUrl(URL.createObjectURL(blob));
      } catch (err) {
        console.error('Failed to load receipt preview:', err);
      }
    };
    fetchFile();
    return () => { if (fileUrl) URL.revokeObjectURL(fileUrl); };
  }, [receiptId]);

  const validateFile = (file) => {
    if (!file) return { valid: false, error: 'No file selected' };
    if (!ALLOWED_TYPES.includes(file.type)) return { valid: false, error: 'Invalid file type. PNG, JPEG, or PDF only.' };
    if (file.size > MAX_FILE_SIZE) return { valid: false, error: 'File too large. Maximum 10MB.' };
    return { valid: true, error: null };
  };

  const handleFileSelect = (file) => {
    const validation = validateFile(file);
    if (!validation.valid) { setError(validation.error); return; }
    setError('');
    setSelectedFile(file);
    setReviewHeader(null);
    setReviewItems([]);
    setReviewNotes('');
    setReviewTags([]);
    setReceiptId(null);
    setFileUrl(null);
    setAiProviderError(false);
    setAiProviderMessage('');
    setIsPdf(file.type === 'application/pdf');
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result);
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  /**
   * Uploads the selected file to the backend.
   * The backend runs OCR (OpenAI or Tesseract depending on user role)
   * and returns extracted data along with any AI provider error flags.
   */
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) { setError('Please select a file'); return; }
    setUploading(true);
    setError('');
    setUploadProgress(0);
    try {
      const interval = setInterval(() => setUploadProgress(p => Math.min(p + 5, 90)), 300);
      const response = await uploadReceipt(selectedFile);
      clearInterval(interval);
      setUploadProgress(100);
      const data = response.data;

      setReceiptId(data.receiptId);
      setOcrSuccess(data.ocrSuccess);
      setOcrMethod(data.ocrMethod || 'tesseract');

      // Store AI provider error state to display in the review step
      setAiProviderError(data.aiProviderError || false);
      setAiProviderMessage(data.aiProviderMessage || '');

      setReviewHeader({
        storeName: data.extractedData?.storeName || '',
        purchaseDate: data.extractedData?.purchaseDate || new Date().toISOString().split('T')[0],
        totalPrice: data.extractedData?.totalPrice || '',
        warrantyMonths: data.extractedData?.warrantyMonths || 12
      });
      setReviewItems(data.extractedData?.items?.length > 0
        ? data.extractedData.items
        : [{ productDescription: '', price: '', warrantyMonths: 12 }]);
      setReviewNotes('');
      setReviewTags([]);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.limitReached) {
        setError(`Storage limit reached: ${errData.error}`);
      } else {
        setError(errData?.error || 'Failed to upload receipt. Please try again.');
      }
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleHeaderChange = (field, value) => setReviewHeader(prev => ({ ...prev, [field]: value }));

  const handleItemChange = (index, field, value) => {
    setReviewItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddItem = () => setReviewItems(prev => [...prev, { productDescription: '', price: '', warrantyMonths: 12 }]);
  const handleRemoveItem = (index) => { if (reviewItems.length > 1) setReviewItems(prev => prev.filter((_, i) => i !== index)); };

  /**
   * Saves the reviewed and corrected receipt data to the backend.
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
        })),
        notes: reviewNotes,
        tags: reviewTags
      });
      setSaveSuccess(true);
      setTimeout(() => navigate('/receipts'), 1500);
    } catch (err) {
      setError('Failed to save receipt. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setReviewHeader(null);
    setReviewItems([]);
    setReviewNotes('');
    setReviewTags([]);
    setReceiptId(null);
    setFileUrl(null);
    setZoomLevel(100);
    setError('');
    setUploadProgress(0);
    setSaveSuccess(false);
    setAiProviderError(false);
    setAiProviderMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── STEP 2: Review ────────────────────────────────────────────────────────
  if (reviewHeader) {
    return (
      <Container fluid className="px-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4 className="mb-0">Review Extracted Information</h4>
          <div className="d-flex gap-2">
            <Button variant="outline-secondary" onClick={handleReset} disabled={saving || saveSuccess}>
              ← Upload Different Receipt
            </Button>
            <Button variant="success" onClick={handleSaveConfirmed}
              disabled={saving || saveSuccess || !reviewHeader.storeName}>
              {saving
                ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Saving...</>
                : 'Confirm and Save Receipt'}
            </Button>
          </div>
        </div>

        {/* AI provider error — shown when OpenAI fell back to Tesseract */}
        {aiProviderError && (
          <Alert variant="warning" className="mb-3">
            <strong>⚠ AI OCR unavailable.</strong> {aiProviderMessage}
          </Alert>
        )}

        {/* Standard OCR success/failure banners (only shown when no AI error) */}
        {!aiProviderError && ocrSuccess && (
          <Alert variant="info" className="mb-3">
            <strong>OCR completed{ocrMethod === 'openai' ? ' (AI-enhanced)' : ''}.</strong>{' '}
            The information on the left was automatically extracted from your receipt.
            Use the receipt preview on the right to verify and correct any errors before saving.
          </Alert>
        )}
        {!aiProviderError && !ocrSuccess && (
          <Alert variant="warning" className="mb-3">
            <strong>OCR had difficulty.</strong> Please fill in the fields manually using the receipt preview.
          </Alert>
        )}

        {error && <Alert variant="danger" onClose={() => setError('')} dismissible className="mb-3">{error}</Alert>}
        {saveSuccess && <Alert variant="success" className="mb-3"><strong>Receipt saved!</strong> Redirecting...</Alert>}

        <Row className="g-3" style={{ minHeight: '75vh' }}>
          {/* Left: edit form */}
          <Col md={6} lg={5}>
            <Card className="h-100">
              <Card.Header className="bg-primary text-white"><strong>Receipt Details</strong></Card.Header>
              <Card.Body style={{ overflowY: 'auto', maxHeight: 'calc(75vh - 56px)' }}>

                <Form.Group className="mb-3">
                  <Form.Label>Store Name <span className="text-danger">*</span></Form.Label>
                  <Form.Control type="text" value={reviewHeader.storeName}
                    onChange={(e) => handleHeaderChange('storeName', e.target.value)}
                    disabled={saving || saveSuccess} />
                </Form.Group>

                <Row className="mb-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Purchase Date <span className="text-danger">*</span></Form.Label>
                      <Form.Control type="date" value={reviewHeader.purchaseDate}
                        onChange={(e) => handleHeaderChange('purchaseDate', e.target.value)}
                        disabled={saving || saveSuccess} />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Total Price (€)</Form.Label>
                      <Form.Control type="number" step="0.01" min="0" value={reviewHeader.totalPrice}
                        onChange={(e) => handleHeaderChange('totalPrice', e.target.value)}
                        disabled={saving || saveSuccess} />
                    </Form.Group>
                  </Col>
                </Row>

                <hr />

                <div className="d-flex justify-content-between align-items-center mb-3">
                  <strong>Items ({reviewItems.length})</strong>
                  <Button variant="outline-primary" size="sm" onClick={handleAddItem} disabled={saving || saveSuccess}>
                    + Add Item
                  </Button>
                </div>

                {reviewItems.map((item, index) => (
                  <Card key={index} className="mb-3 bg-light border">
                    <Card.Body className="py-2 px-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <small><strong>Item {index + 1}</strong></small>
                        {reviewItems.length > 1 && (
                          <Button variant="outline-danger" size="sm" onClick={() => handleRemoveItem(index)}
                            disabled={saving || saveSuccess}>Remove</Button>
                        )}
                      </div>
                      <Form.Group className="mb-2">
                        <Form.Label className="small mb-1">Description <span className="text-danger">*</span></Form.Label>
                        <Form.Control type="text" size="sm" value={item.productDescription}
                          onChange={(e) => handleItemChange(index, 'productDescription', e.target.value)}
                          disabled={saving || saveSuccess} />
                      </Form.Group>
                      <Row>
                        <Col xs={6}>
                          <Form.Group>
                            <Form.Label className="small mb-1">Price (€)</Form.Label>
                            <Form.Control type="number" size="sm" step="0.01" min="0" value={item.price}
                              onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                              disabled={saving || saveSuccess} />
                          </Form.Group>
                        </Col>
                        <Col xs={6}>
                          <Form.Group>
                            <Form.Label className="small mb-1">Warranty (months)</Form.Label>
                            <Form.Control type="number" size="sm" min="0" max="120" value={item.warrantyMonths}
                              onChange={(e) => handleItemChange(index, 'warrantyMonths', e.target.value)}
                              disabled={saving || saveSuccess} />
                          </Form.Group>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                ))}

                <hr />

                {/* Notes field */}
                <Form.Group className="mb-3">
                  <Form.Label>Notes <small className="text-muted">(optional)</small></Form.Label>
                  <Form.Control as="textarea" rows={2} value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Any additional notes about this purchase..."
                    maxLength={1000} disabled={saving || saveSuccess} />
                  <Form.Text className="text-muted">{reviewNotes.length}/1000</Form.Text>
                </Form.Group>

                {/* Tags selector */}
                <Form.Group className="mb-3">
                  <Form.Label>Tags <small className="text-muted">(optional)</small></Form.Label>
                  <TagSelector selectedTags={reviewTags} onChange={setReviewTags} disabled={saving || saveSuccess} />
                </Form.Group>

              </Card.Body>
            </Card>
          </Col>

          {/* Right: receipt preview */}
          <Col md={6} lg={7}>
            <Card className="h-100">
              <Card.Header className="bg-secondary text-white d-flex justify-content-between align-items-center">
                <strong>{isPdf ? 'Receipt PDF' : 'Receipt Image'}</strong>
                <div className="d-flex align-items-center gap-2">
                  <Button variant="outline-light" size="sm"
                    onClick={() => setZoomLevel(p => Math.max(p - ZOOM_STEP, MIN_ZOOM))}
                    disabled={zoomLevel <= MIN_ZOOM}>−</Button>
                  <span className="text-white small" style={{ minWidth: '45px', textAlign: 'center' }}>{zoomLevel}%</span>
                  <Button variant="outline-light" size="sm"
                    onClick={() => setZoomLevel(p => Math.min(p + ZOOM_STEP, MAX_ZOOM))}
                    disabled={zoomLevel >= MAX_ZOOM}>+</Button>
                  <Button variant="outline-light" size="sm" onClick={() => setZoomLevel(100)}>↺</Button>
                </div>
              </Card.Header>
              <Card.Body className="p-0" style={{
                overflowY: 'auto', overflowX: 'auto',
                maxHeight: 'calc(75vh - 56px)', backgroundColor: '#f8f9fa'
              }}>
                {fileUrl ? (
                  <div style={{
                    width: `${zoomLevel}%`,
                    minWidth: zoomLevel > 100 ? `${zoomLevel}%` : '100%',
                    transition: 'width 0.2s ease'
                  }}>
                    {isPdf
                      ? <embed src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`} type="application/pdf"
                          width="100%" style={{ height: `${Math.max(600, (zoomLevel / 100) * 800)}px`, display: 'block' }} />
                      : <img src={fileUrl} alt="Receipt" style={{ width: '100%', display: 'block' }} />}
                  </div>
                ) : (
                  <div className="d-flex flex-column align-items-center justify-content-center h-100 py-5">
                    <Spinner animation="border" variant="secondary" />
                    <p className="mt-3 text-muted">{isPdf ? 'Loading PDF...' : 'Loading image...'}</p>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  // ── STEP 1: Upload ─────────────────────────────────────────────────────────
  return (
    <Container className="mt-0">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <Card>
            <Card.Header className="bg-primary text-white"><h4 className="mb-0">Upload Receipt</h4></Card.Header>
            <Card.Body>
              {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

              <Form noValidate onSubmit={handleUploadSubmit}>
                <div
                  className={`border rounded p-5 text-center mb-3 ${dragActive ? 'border-primary bg-light' : 'border-secondary'}`}
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                  style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <h5 className="mt-3">{selectedFile ? selectedFile.name : 'Drag and drop your receipt here'}</h5>
                  <p className="text-muted">or click to browse files</p>
                  <p className="text-muted small mb-0">Supported formats: PNG, JPEG, PDF (max 10MB)</p>
                  <Form.Control ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.pdf"
                    onChange={handleFileChange} disabled={uploading} className="d-none" />
                </div>

                {previewUrl && (
                  <div className="text-center mb-3">
                    <img src={previewUrl} alt="Receipt preview" className="img-fluid rounded" style={{ maxHeight: '300px' }} />
                  </div>
                )}

                {selectedFile && (
                  <Card className="mb-3 bg-light">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong>{selectedFile.name}</strong>
                          <br />
                          <small className="text-muted">{(selectedFile.size / 1024).toFixed(2)} KB | {selectedFile.type}</small>
                        </div>
                        <Button variant="outline-danger" size="sm" onClick={handleReset} disabled={uploading}>Remove</Button>
                      </div>
                    </Card.Body>
                  </Card>
                )}

                {uploading && (
                  <div className="mb-3">
                    <ProgressBar now={uploadProgress} label={`${uploadProgress}%`} animated striped />
                    <p className="text-center mt-2 text-muted">
                      <Spinner animation="border" size="sm" className="me-2" />
                      {uploadProgress < 90 ? 'Uploading...' : 'Running OCR...'}
                    </p>
                  </div>
                )}

                <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                  <Button variant="outline-secondary" onClick={() => navigate('/receipts')} disabled={uploading}>Cancel</Button>
                  <Button variant="primary" type="submit" disabled={!selectedFile || uploading}>
                    {uploading
                      ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Processing...</>
                      : 'Upload and Process'}
                  </Button>
                </div>
              </Form>

              <Alert variant="info" className="mt-3 mb-0">
                <small>
                  <strong>Note:</strong> After uploading, you will review the extracted data side by side
                  with your receipt before saving.
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