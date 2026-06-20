/**
 * File: AdminReports.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 *
 * Admin reports page with three sections:
 * 1. Schedule configuration - enable/disable, frequency, last run time
 * 2. Generate Now - on-demand report generation
 * 3. Saved Reports - list of .log files with download buttons
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Card, Row, Col, Form, Button,
  Alert, Spinner, Badge, Table
} from 'react-bootstrap';
import {
  getReportSchedule, updateReportSchedule,
  generateReport, listReports, downloadReport
} from '../services/api';
import { formatDateTime, downloadBlob } from '../utils/format';

// Admin reports page: schedule configuration, on-demand generation, and saved report downloads.
function AdminReports() {
  const navigate = useNavigate();

  // Schedule settings
  const [schedule, setSchedule] = useState({ enabled: false, frequency: 'weekly', lastRun: null });
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState('');
  const [scheduleError, setScheduleError] = useState('');

  // Report generation
  const [generating, setGenerating] = useState(false);
  const [generateSuccess, setGenerateSuccess] = useState('');
  const [generateError, setGenerateError] = useState('');

  // Saved report files
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [downloadingFile, setDownloadingFile] = useState('');

  // Loads the schedule settings and saved report list on mount.
  useEffect(() => {
    fetchSchedule();
    fetchReports();
  }, []);

  // Fetches the current scheduled report settings.
  const fetchSchedule = async () => {
    setLoadingSchedule(true);
    try {
      const response = await getReportSchedule();
      setSchedule(response.data.schedule);
    } catch (err) {
      setScheduleError('Failed to load schedule settings');
    } finally {
      setLoadingSchedule(false);
    }
  };

  // Fetches the list of saved report files.
  const fetchReports = async () => {
    setLoadingReports(true);
    try {
      const response = await listReports();
      setReports(response.data.reports || []);
    } catch {
      // Non-critical - just show empty list
    } finally {
      setLoadingReports(false);
    }
  };

  /**
   * Saves the updated schedule settings to the backend.
   */
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    setScheduleSuccess(''); setScheduleError('');
    setSavingSchedule(true);
    try {
      await updateReportSchedule(schedule.enabled, schedule.frequency);
      setScheduleSuccess('Schedule settings saved successfully');
    } catch (err) {
      setScheduleError(err.response?.data?.error || 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  /**
   * Generates a report on demand immediately and refreshes the file list.
   */
  const handleGenerateNow = async () => {
    setGenerating(true); setGenerateSuccess(''); setGenerateError('');
    try {
      const response = await generateReport();
      setGenerateSuccess(`Report generated: ${response.data.filename}`);
      fetchReports(); // Refresh the file list to show the new report
    } catch (err) {
      setGenerateError(err.response?.data?.error || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Downloads a .log file by triggering a blob download in the browser.
   */
  const handleDownload = async (filename) => {
    setDownloadingFile(filename);
    try {
      const response = await downloadReport(filename);
      const blob = new Blob([response.data], { type: 'text/plain;charset=utf-8;' });
      downloadBlob(blob, filename);
    } catch {
      // File not found or server error
      alert('Failed to download report file');
    } finally {
      setDownloadingFile('');
    }
  };

  /**
   * Formats a file size in bytes into a human-readable string.
   */
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  /**
   * Parses the timestamp from a report filename for display.
   * Filename format: WhereIsIt_Report_YYYY-MM-DD_HH-MM-SS.log
   */
  const parseReportDate = (filename) => {
    try {
      const match = filename.match(/WhereIsIt_Report_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.log/);
      if (!match) return filename;
      const dateStr = `${match[1]}T${match[2].replace(/-/g, ':')}Z`;
      return new Date(dateStr).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
      }) + ' UTC';
    } catch {
      return filename;
    }
  };

  return (
    <Container className="mt-0">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <Button variant="outline-secondary" size="sm" className="me-3"
            onClick={() => navigate('/admin/dashboard')}>← Dashboard</Button>
          <strong className="fs-4">System Reports</strong>
        </div>
        <Button variant="primary" onClick={handleGenerateNow} disabled={generating}>
          {generating
            ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Generating...</>
            : 'Generate Report Now'}
        </Button>
      </div>

      {generateSuccess && (
        <Alert variant="success" dismissible onClose={() => setGenerateSuccess('')}>
          {generateSuccess}
        </Alert>
      )}
      {generateError && (
        <Alert variant="danger" dismissible onClose={() => setGenerateError('')}>
          {generateError}
        </Alert>
      )}

      <Row className="g-4">
        {/* Schedule configuration */}
        <Col md={5}>
          <Card className="h-100">
            <Card.Header className="bg-primary text-white">
              <strong>Scheduled Report Settings</strong>
            </Card.Header>
            <Card.Body>
              {scheduleSuccess && (
                <Alert variant="success" dismissible onClose={() => setScheduleSuccess('')}>{scheduleSuccess}</Alert>
              )}
              {scheduleError && (
                <Alert variant="danger" dismissible onClose={() => setScheduleError('')}>{scheduleError}</Alert>
              )}

              {loadingSchedule ? (
                <div className="text-center py-3"><Spinner animation="border" variant="primary" /></div>
              ) : (
                <Form noValidate onSubmit={handleSaveSchedule}>
                  <Form.Group className="mb-3">
                    <Form.Check
                      type="switch"
                      id="reportEnabled"
                      label="Enable scheduled reports"
                      checked={schedule.enabled}
                      onChange={(e) => setSchedule(p => ({ ...p, enabled: e.target.checked }))}
                    />
                    <Form.Text className="text-muted">
                      When enabled, reports are automatically generated and saved to the server.
                    </Form.Text>
                  </Form.Group>

                  <Form.Group className="mb-4">
                    <Form.Label>Report frequency</Form.Label>
                    <Form.Select
                      value={schedule.frequency}
                      onChange={(e) => setSchedule(p => ({ ...p, frequency: e.target.value }))}
                      disabled={!schedule.enabled}
                    >
                      <option value="daily">Daily - generated every day at 01:00 UTC</option>
                      <option value="weekly">Weekly - generated every 7 days</option>
                      <option value="monthly">Monthly - generated every 30 days</option>
                    </Form.Select>
                  </Form.Group>

                  {schedule.lastRun && (
                    <Alert variant="light" className="mb-3">
                      <small className="text-muted">
                        Last report generated: <strong>{formatDateTime(schedule.lastRun, { fallback: '-' })}</strong>
                      </small>
                    </Alert>
                  )}
                  {!schedule.lastRun && (
                    <Alert variant="light" className="mb-3">
                      <small className="text-muted">No reports have been generated yet.</small>
                    </Alert>
                  )}

                  <Button variant="primary" type="submit" disabled={savingSchedule}>
                    {savingSchedule
                      ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Saving...</>
                      : 'Save Schedule'}
                  </Button>
                </Form>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Report content description */}
        <Col md={7}>
          <Card className="h-100">
            <Card.Header className="bg-secondary text-white">
              <strong>What Each Report Contains</strong>
            </Card.Header>
            <Card.Body>
              <p className="text-muted small mb-3">
                Reports are saved as <code>.log</code> files in <code>backend/reports/</code>.
                Each report covers the period since the previous report (daily/weekly/monthly).
              </p>
              <div className="d-flex flex-column gap-2">
                {[
                  { icon: '📊', title: 'System Summary', desc: 'Total users by role, active vs suspended, total receipts, ticket breakdown' },
                  { icon: '👤', title: 'New Users', desc: 'All accounts registered during the report period with email and role' },
                  { icon: '🔒', title: 'Security Events', desc: 'Unauthorized access attempts, failed MFA, account suspensions, admin MFA resets' },
                  { icon: '⚙', title: 'Admin Actions', desc: 'All tier changes, password resets, suspensions, and reactivations performed by admins' },
                  { icon: '📋', title: 'Full Audit Log', desc: 'Every logged event for the period (up to 1000 entries) with timestamps and IP addresses' },
                ].map(item => (
                  <div key={item.title} className="d-flex gap-3 p-2 bg-light rounded">
                    <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
                    <div>
                      <strong style={{ fontSize: '0.9rem' }}>{item.title}</strong>
                      <div className="text-muted" style={{ fontSize: '0.82rem' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Saved report files */}
      <Card className="mt-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <strong>Saved Reports</strong>
          <Button variant="link" size="sm" onClick={fetchReports} disabled={loadingReports}>
            {loadingReports ? <Spinner as="span" animation="border" size="sm" /> : '↻ Refresh'}
          </Button>
        </Card.Header>
        <Card.Body className="p-0">
          {loadingReports ? (
            <div className="text-center py-4"><Spinner animation="border" variant="secondary" /></div>
          ) : reports.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <p className="mb-2">No reports saved yet.</p>
              <small>Click <strong>"Generate Report Now"</strong> to create your first report.</small>
            </div>
          ) : (
            <Table hover className="mb-0">
              <thead className="table-light">
                <tr>
                  <th>Filename</th>
                  <th>Generated</th>
                  <th>Size</th>
                  <th style={{ width: '120px' }}></th>
                </tr>
              </thead>
              <tbody>
                {reports.map(report => (
                  <tr key={report.filename}>
                    <td>
                      <code style={{ fontSize: '0.82rem' }}>{report.filename}</code>
                    </td>
                    <td>
                      <small className="text-muted">{parseReportDate(report.filename)}</small>
                    </td>
                    <td>
                      <Badge bg="secondary">{formatFileSize(report.sizeBytes)}</Badge>
                    </td>
                    <td>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => handleDownload(report.filename)}
                        disabled={downloadingFile === report.filename}
                      >
                        {downloadingFile === report.filename
                          ? <Spinner as="span" animation="border" size="sm" />
                          : '↓ Download'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
        {reports.length > 0 && (
          <Card.Footer className="text-muted">
            {reports.length} report{reports.length !== 1 ? 's' : ''} saved
          </Card.Footer>
        )}
      </Card>
    </Container>
  );
}

export default AdminReports;