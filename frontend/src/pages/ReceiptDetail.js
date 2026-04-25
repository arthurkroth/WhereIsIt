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
import TagSelector from '../components/TagSelector';

/**
 * ReceiptDetail Page
 * Shows full details of a single receipt, including items, notes, and tags.
 * Allows inline editing and deletion.
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
  const [fileUrl, setFileUrl] = useState(null);

  const [editHeader, setEditHeader] = useState({ storeName: '', purchaseDate: '', totalPrice: '', warrantyMonths: '' });
  const [editItems, setEditItems] = useState([]);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState([]);

  useEffect(() => { fetchReceipt(); }, [id]);

  // Auto-recalculate total when items change in edit mode
  useEffect(() => {
    if (!editing) return;
    const total = editItems.reduce((sum, item) => {
      const p = parseFloat(item.price);
      return sum + (isNaN(p) ? 0 : p);
    }, 0);
    setEditHeader(prev => ({ ...prev, totalPrice: total.toFixed(2) }));
  }, [editItems, editing]);

  useEffect(() => {
    if (!receipt?.hasFile) return;
    const fetchFile = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`http://localhost:3001/receipts/${receipt.id}/file`,
          { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const blob = await res.blob();
        setFileUrl(URL.createObjectURL(blob));
      } catch (err) {
        console.error('Failed to load file:', err);
      }
    };
    fetchFile();
    return () => { if (fileUrl) URL.revokeObjectURL(fileUrl); };
  }, [receipt]);

  const fetchReceipt = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getReceiptById(id);
      const data = response.data.receipt;
      setReceipt(data);

      const formattedDate = data.purchaseDate
        ? new Date(data.purchaseDate).toISOString().split('T')[0]
        : '';

      setEditHeader({ storeName: data.storeName || '', purchaseDate: formattedDate,
        totalPrice: data.totalPrice || '', warrantyMonths: data.warrantyMonths || 12 });
      setEditItems(data.items?.length > 0
        ? data.items.map(item => ({ productDescription: item.productDescription, price: item.price, warrantyMonths: item.warrantyMonths }))
        : [{ productDescription: '', price: '', warrantyMonths: 12 }]);
      setEditNotes(data.notes || '');
      setEditTags(Array.isArray(data.tags) ? data.tags : []);
    } catch (err) {
      setError('Failed to load receipt details');
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (field, value) => setEditHeader(prev => ({ ...prev, [field]: value }));
  const handleItemChange = (index, field, value) => {
    setEditItems(prev => { const u = [...prev]; u[index] = { ...u[index], [field]: value }; return u; });
  };
  const handleAddItem = () => setEditItems(prev => [...prev, { productDescription: '', price: '', warrantyMonths: 12 }]);
  const handleRemoveItem = (index) => { if (editItems.length > 1) setEditItems(prev => prev.filter((_, i) => i !== index)); };

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
        })),
        notes: editNotes,
        tags: editTags
      });
      await fetchReceipt();
      setEditing(false);
    } catch (err) {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/receipts/${id}`);
      navigate('/receipts');
    } catch (err) {
      setError('Failed to delete receipt');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const getStatusBadgeVariant = (status) => {
    if (status === 'active') return 'success';
    if (status === 'expiring_soon') return 'warning';
    if (status === 'expired') return 'danger';
    return 'secondary';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const isPdf = () => receipt?.fileName?.toLowerCase().endsWith('.pdf');

  if (loading) return (
    <Container className="mt-0 text-center"><Spinner animation="border" variant="primary" /><p className="mt-3">Loading receipt...</p></Container>
  );

  if (error && !receipt) return (
    <Container className="mt-0"><Alert variant="danger">{error}</Alert>
      <Button variant="secondary" onClick={() => navigate('/receipts')}>Back to Receipts</Button></Container>
  );

  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <Button variant="outline-secondary" size="sm" onClick={() => navigate('/receipts')} className="me-2">← Back</Button>
          <span className="h4">Receipt Details</span>
        </div>
        <div>
          {!editing ? (
            <>
              <Button variant="primary" className="me-2" onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="outline-danger" onClick={() => setShowDeleteModal(true)}>Delete</Button>
            </>
          ) : (
            <>
              <Button variant="success" className="me-2" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner as="span" animation="border" size="sm" className="me-1" /> : null}Save Changes
              </Button>
              <Button variant="outline-secondary" onClick={() => { setEditing(false); fetchReceipt(); }} disabled={saving}>Cancel</Button>
            </>
          )}
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      <Row>
        <Col md={receipt?.hasFile ? 7 : 12}>

          {/* Purchase Information */}
          <Card className="mb-4">
            <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
              <strong>Purchase Information</strong>
              <Badge bg={getStatusBadgeVariant(receipt?.warrantyStatus)}>
                {receipt?.warrantyStatus?.replace('_', ' ').toUpperCase()}
              </Badge>
            </Card.Header>
            <Card.Body>
              {editing ? (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Store Name</Form.Label>
                    <Form.Control type="text" value={editHeader.storeName}
                      onChange={(e) => handleHeaderChange('storeName', e.target.value)} />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Purchase Date</Form.Label>
                    <Form.Control type="date" value={editHeader.purchaseDate}
                      onChange={(e) => handleHeaderChange('purchaseDate', e.target.value)} />
                  </Form.Group>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Total Price (€) <small className="text-muted fw-normal">— auto-calculated</small></Form.Label>
                        <Form.Control type="number" step="0.01" min="0" value={editHeader.totalPrice}
                          onChange={(e) => handleHeaderChange('totalPrice', e.target.value)} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label>Warranty (months)</Form.Label>
                        <Form.Control type="number" min="0" value={editHeader.warrantyMonths}
                          onChange={(e) => handleHeaderChange('warrantyMonths', e.target.value)} />
                      </Form.Group>
                    </Col>
                  </Row>
                </>
              ) : (
                <Row>
                  <Col md={6} className="mb-3"><small className="text-muted">Store</small><div><strong>{receipt?.storeName}</strong></div></Col>
                  <Col md={6} className="mb-3"><small className="text-muted">Purchase Date</small><div><strong>{formatDate(receipt?.purchaseDate)}</strong></div></Col>
                  <Col md={6} className="mb-3"><small className="text-muted">Total Price</small><div><strong>€{parseFloat(receipt?.totalPrice || 0).toFixed(2)}</strong></div></Col>
                  <Col md={6} className="mb-3"><small className="text-muted">Warranty Expires</small><div><strong>{formatDate(receipt?.warrantyExpiry)}</strong></div></Col>
                  <Col md={6} className="mb-3"><small className="text-muted">Uploaded On</small><div><strong>{formatDate(receipt?.createdAt)}</strong></div></Col>
                  <Col md={6} className="mb-3"><small className="text-muted">Items</small><div><strong>{receipt?.itemCount || 0} item(s)</strong></div></Col>
                </Row>
              )}
            </Card.Body>
          </Card>

          {/* Line Items */}
          <Card className="mb-4">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <strong>Line Items</strong>
              {editing && <Button variant="outline-primary" size="sm" onClick={handleAddItem}>+ Add Item</Button>}
            </Card.Header>
            <Card.Body className={editing ? '' : 'p-0'}>
              {editing ? (
                editItems.map((item, index) => (
                  <Card key={index} className="mb-3 bg-light">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <strong>Item {index + 1}</strong>
                        {editItems.length > 1 && <Button variant="outline-danger" size="sm" onClick={() => handleRemoveItem(index)}>Remove</Button>}
                      </div>
                      <Form.Group className="mb-3">
                        <Form.Label>Product Description</Form.Label>
                        <Form.Control type="text" value={item.productDescription}
                          onChange={(e) => handleItemChange(index, 'productDescription', e.target.value)} />
                      </Form.Group>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-2">
                            <Form.Label>Price (€)</Form.Label>
                            <Form.Control type="number" step="0.01" min="0" value={item.price}
                              onChange={(e) => handleItemChange(index, 'price', e.target.value)} />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-2">
                            <Form.Label>Warranty (months)</Form.Label>
                            <Form.Control type="number" min="0" max="120" value={item.warrantyMonths}
                              onChange={(e) => handleItemChange(index, 'warrantyMonths', e.target.value)} />
                          </Form.Group>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                ))
              ) : (
                <div className="table-responsive">
                  <Table className="mb-0">
                    <thead className="table-light">
                      <tr><th>Product</th><th>Price</th><th>Warranty</th></tr>
                    </thead>
                    <tbody>
                      {receipt?.items?.length > 0
                        ? receipt.items.map((item, index) => (
                          <tr key={index}>
                            <td>{item.productDescription}</td>
                            <td>€{parseFloat(item.price || 0).toFixed(2)}</td>
                            <td>{item.warrantyMonths} months</td>
                          </tr>
                        ))
                        : <tr><td colSpan="3" className="text-center text-muted">No items found</td></tr>}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Notes and Tags */}
          <Card className="mb-4">
            <Card.Header><strong>Notes & Tags</strong></Card.Header>
            <Card.Body>
              {editing ? (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Notes</Form.Label>
                    <Form.Control as="textarea" rows={3} value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Any additional notes about this purchase..."
                      maxLength={1000} />
                    <Form.Text className="text-muted">{editNotes.length}/1000</Form.Text>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Tags</Form.Label>
                    <TagSelector selectedTags={editTags} onChange={setEditTags} />
                  </Form.Group>
                </>
              ) : (
                <>
                  <div className="mb-3">
                    <small className="text-muted">Notes</small>
                    <div>{receipt?.notes || <span className="text-muted fst-italic">No notes</span>}</div>
                  </div>
                  <div>
                    <small className="text-muted">Tags</small>
                    <div className="d-flex flex-wrap gap-2 mt-1">
                      {receipt?.tags?.length > 0
                        ? receipt.tags.map(tag => (
                          <span key={tag} className="badge rounded-pill bg-primary">{tag}</span>
                        ))
                        : <span className="text-muted fst-italic">No tags</span>}
                    </div>
                  </div>
                </>
              )}
            </Card.Body>
          </Card>

        </Col>

        {/* Receipt file preview */}
        {receipt?.hasFile && (
          <Col md={5}>
            <Card>
              <Card.Header className="bg-secondary text-white">
                <strong>{isPdf() ? 'Receipt PDF' : 'Receipt Image'}</strong>
              </Card.Header>
              <Card.Body className="text-center">
                {fileUrl ? (
                  isPdf()
                    ? <embed src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`} type="application/pdf"
                        width="100%" height="500px" style={{ borderRadius: '4px' }} />
                    : <img src={fileUrl} alt="Receipt" className="img-fluid rounded"
                        style={{ maxHeight: '500px', objectFit: 'contain' }} />
                ) : (
                  <div className="py-4">
                    <Spinner animation="border" variant="secondary" />
                    <p className="mt-2 text-muted">{isPdf() ? 'Loading PDF...' : 'Loading image...'}</p>
                  </div>
                )}
                <div className="mt-2">
                  <a href={getReceiptFileUrl(receipt.id)} target="_blank" rel="noopener noreferrer"
                    className="btn btn-sm btn-outline-secondary me-2">Open Full Size</a>
                  <a href={getReceiptFileUrl(receipt.id)} download
                    className="btn btn-sm btn-outline-primary">Download</a>
                </div>
              </Card.Body>
            </Card>
          </Col>
        )}
      </Row>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton><Modal.Title>Confirm Delete</Modal.Title></Modal.Header>
        <Modal.Body>Are you sure you want to delete this receipt and all its items? This cannot be undone.</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Spinner as="span" animation="border" size="sm" className="me-1" /> : null}Delete Receipt
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default ReceiptDetail;