/**
 * File: Privacy.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React from 'react';
import { Container, Card } from 'react-bootstrap';

/**
 * Privacy Policy Page
 * Displayed when the user clicks "Privacy Policy" on the registration form.
 * Opens in a new tab via target="_blank" on the Register page link.
 */
function Privacy() {
  return (
    <Container className="py-5" style={{ maxWidth: '800px' }}>
      <Card>
        <Card.Body className="p-5">

          <h1 className="mb-1">Privacy Policy</h1>
          <p className="text-muted mb-4">
            <small>WhereIsIt? - Effective date: January 2026</small>
          </p>

          <hr className="mb-4" />

          {/* Academic Notice */}
          <div className="alert alert-info mb-4">
            <strong>Academic Project Notice</strong>
            <p className="mb-0 mt-1">
              WhereIsIt? is an academic project developed as part of a BSc (Honours) in
              Computing - Cybersecurity at National College of Ireland. This application is
              intended for demonstration and evaluation purposes only. All data collected
              is stored locally and is not shared with any third parties.
            </p>
          </div>

          <section className="mb-4">
            <h4>1. Introduction</h4>
            <p>
              This Privacy Policy explains how WhereIsIt? collects,
              uses, stores, and protects your personal information when you use our Service.
              We are committed to protecting your privacy and handling your data in a
              transparent and secure manner, in accordance with the EU General Data
              Protection Regulation (GDPR).
            </p>
          </section>

          <section className="mb-4">
            <h4>2. Data Controller</h4>
            <p>
              The data controller for this Service is:
            </p>
            <address className="ms-3">
              <strong>Arthur Kroth</strong><br />
              BSc Computing (Cybersecurity) Student<br />
              National College of Ireland<br />
              Mayor Street Lower, Dublin 1, Ireland<br />
              Email:{' '}
              <a href="mailto:x22166971@student.ncirl.ie">x22166971@student.ncirl.ie</a>
            </address>
          </section>

          <section className="mb-4">
            <h4>3. Information We Collect</h4>
            <p>We collect the following categories of personal data:</p>

            <h6 className="mt-3">3.1 Account Information</h6>
            <ul>
              <li><strong>First and last name</strong> - used to personalise your experience</li>
              <li><strong>Email address</strong> - used for account verification, login, and password reset</li>
              <li><strong>Password</strong> - stored as a bcrypt hash (never in plain text)</li>
              <li><strong>Account creation date</strong> - stored for audit and support purposes</li>
              <li><strong>Account role</strong> - FREE or PREMIUM tier designation</li>
            </ul>

            <h6 className="mt-3">3.2 Security Data</h6>
            <ul>
              <li><strong>MFA secret</strong> - stored encrypted, used for two-factor authentication</li>
              <li><strong>MFA recovery codes</strong> - stored as SHA-256 hashes</li>
              <li><strong>Password reset tokens</strong> - stored as SHA-256 hashes with expiry timestamps</li>
              <li><strong>Email verification tokens</strong> - stored as SHA-256 hashes with expiry timestamps</li>
            </ul>

            <h6 className="mt-3">3.3 Receipt Data</h6>
            <ul>
              <li><strong>Store name</strong> - stored encrypted using AES-256-GCM</li>
              <li><strong>Purchase date and total price</strong> - stored in the database</li>
              <li><strong>Product descriptions</strong> - stored encrypted using AES-256-GCM</li>
              <li><strong>Warranty duration</strong> - stored in the database</li>
              <li><strong>Notes</strong> - stored encrypted using AES-256-GCM</li>
              <li><strong>Tags</strong> - stored as plain JSON (non-sensitive category labels)</li>
              <li><strong>Receipt files</strong> - uploaded images and PDFs stored on the server</li>
            </ul>

            <h6 className="mt-3">3.4 Audit Logs</h6>
            <ul>
              <li>
                <strong>Action logs</strong> - records of key account actions (login, registration,
                receipt uploads, deletions) including timestamps and IP addresses, used for
                security monitoring and accountability
              </li>
            </ul>
          </section>

          <section className="mb-4">
            <h4>4. How We Use Your Data</h4>
            <p>We use your personal data for the following purposes:</p>
            <ul>
              <li>
                <strong>Providing the Service</strong> - storing and displaying your receipts,
                calculating warranty expiry dates, and sending you relevant alerts
              </li>
              <li>
                <strong>Account management</strong> - verifying your identity, managing your
                account settings, and enabling password reset
              </li>
              <li>
                <strong>Security</strong> - detecting and preventing unauthorised access,
                enforcing session timeouts, and maintaining audit trails
              </li>
              <li>
                <strong>Communication</strong> - sending transactional emails such as email
                verification links and password reset links
              </li>
            </ul>
            <p>
              We process your data on the legal basis of <strong>contract performance</strong>
              (to provide the Service you have signed up for) and <strong>legitimate interests</strong>
              (security monitoring and fraud prevention).
            </p>
          </section>

          <section className="mb-4">
            <h4>5. Data Security</h4>
            <p>
              We implement appropriate technical and organisational security measures to
              protect your personal data, including:
            </p>
            <ul>
              <li>
                <strong>Encryption at rest</strong> - sensitive fields (store name, product
                descriptions, notes) are encrypted using AES-256-GCM before storage
              </li>
              <li>
                <strong>Password hashing</strong> - passwords are hashed using bcrypt with a
                cost factor of 12 and are never stored in plain text
              </li>
              <li>
                <strong>Token hashing</strong> - security tokens (MFA recovery codes, password
                reset tokens, email verification tokens) are stored as SHA-256 hashes
              </li>
              <li>
                <strong>Two-factor authentication</strong> - TOTP-based MFA is available to
                all users to protect their accounts
              </li>
              <li>
                <strong>Session management</strong> - sessions expire after 30 minutes of
                inactivity and are managed via signed JWTs
              </li>
              <li>
                <strong>Access control</strong> - all API endpoints are protected by
                authentication and role-based access control
              </li>
            </ul>
          </section>

          <section className="mb-4">
            <h4>6. Data Retention</h4>
            <p>
              We retain your personal data for as long as your account remains active.
              If you delete your account or a receipt, the associated data and files are
              permanently deleted from our systems. Audit log entries are retained for
              the lifetime of the account for security purposes.
            </p>
            <p>
              Expired verification and reset tokens are automatically cleared from the
              database once used or upon expiry.
            </p>
          </section>

          <section className="mb-4">
            <h4>7. Data Sharing</h4>
            <p>
              We do not sell, rent, or share your personal data with any third parties.
              Your data is stored locally on the application server and is not transmitted
              to any external services, with the exception of transactional emails sent via
              Nodemailer (using Ethereal Email in development — a local fake SMTP service
              that does not deliver emails externally).
            </p>
          </section>

          <section className="mb-4">
            <h4>8. Your Rights Under GDPR</h4>
            <p>
              As a data subject under the GDPR, you have the following rights:
            </p>
            <ul>
              <li>
                <strong>Right of access</strong> - you can view all your personal data and
                receipts through the Service at any time
              </li>
              <li>
                <strong>Right to rectification</strong> - you can update your name and email
                address from your Profile page at any time
              </li>
              <li>
                <strong>Right to erasure</strong> - you can delete individual receipts through
                the Service. To request full account deletion, contact us at the address below
              </li>
              <li>
                <strong>Right to restriction of processing</strong> - you may request that we
                restrict processing of your data in certain circumstances
              </li>
              <li>
                <strong>Right to data portability</strong> - you may request a copy of your
                personal data in a structured, machine-readable format
              </li>
              <li>
                <strong>Right to object</strong> - you may object to the processing of your
                personal data in certain circumstances
              </li>
            </ul>
            <p>
              To exercise any of these rights, please contact us at{' '}
              <a href="mailto:x22166971@student.ncirl.ie">x22166971@student.ncirl.ie</a>.
            </p>
          </section>

          <section className="mb-4">
            <h4>9. Cookies</h4>
            <p>
              WhereIsIt? does not use tracking or advertising cookies. The Service uses
              browser localStorage solely to store your authentication token (JWT) for
              the duration of your session. This is strictly necessary for the Service
              to function and does not require consent under GDPR.
            </p>
          </section>

          <section className="mb-4">
            <h4>10. Changes to This Policy</h4>
            <p>
              We may update this Privacy Policy from time to time. We will notify users
              of any significant changes. Continued use of the Service after changes
              constitutes acceptance of the revised policy.
            </p>
          </section>

          <section className="mb-0">
            <h4>11. Contact Us</h4>
            <p className="mb-0">
              For any questions or requests relating to this Privacy Policy or your personal
              data, please contact:{' '}
              <a href="mailto:x22166971@student.ncirl.ie">x22166971@student.ncirl.ie</a>
            </p>
          </section>

          <hr className="mt-4 mb-3" />
          <p className="text-muted small mb-0 text-center">
            WhereIsIt? - BSc Computing (Cybersecurity) Final Year Project -
            National College of Ireland, 2025/2026
          </p>

        </Card.Body>
      </Card>
    </Container>
  );
}

export default Privacy;