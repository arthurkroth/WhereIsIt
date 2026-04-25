/**
 * File: Terms.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React from 'react';
import { Container, Card } from 'react-bootstrap';

/**
 * Terms of Service Page
 * Displayed when the user clicks "Terms of Service" on the registration form.
 * Opens in a new tab via target="_blank" on the Register page link.
 */
function Terms() {
  return (
    <Container className="py-5" style={{ maxWidth: '800px' }}>
      <Card>
        <Card.Body className="p-5">

          <h1 className="mb-1">Terms of Service</h1>
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
              intended for demonstration and evaluation purposes only and is not a commercial
              product or service.
            </p>
          </div>

          <section className="mb-4">
            <h4>1. Acceptance of Terms</h4>
            <p>
              By creating an account and using WhereIsIt? (the "Service"), you agree to be
              bound by these Terms of Service. If you do not agree to these terms, you must
              not use the Service.
            </p>
          </section>

          <section className="mb-4">
            <h4>2. Description of the Service</h4>
            <p>
              WhereIsIt? is a web application that allows users to store, manage, and track
              receipts, invoices, and warranty information for their purchases. The Service
              provides features including:
            </p>
            <ul>
              <li>Secure upload and storage of receipt files (images and PDFs)</li>
              <li>Automatic data extraction from receipts using Optical Character Recognition (OCR)</li>
              <li>Warranty expiry tracking and notifications</li>
              <li>Search and filtering of stored receipts</li>
              <li>Two-factor authentication (MFA) for enhanced account security</li>
            </ul>
          </section>

          <section className="mb-4">
            <h4>3. User Accounts</h4>
            <p>
              To use the Service, you must create an account by providing your name, a valid
              email address, and a password. You are responsible for:
            </p>
            <ul>
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activity that occurs under your account</li>
              <li>Notifying us immediately of any unauthorised access to your account</li>
              <li>Providing accurate and truthful registration information</li>
            </ul>
            <p>
              You must verify your email address before you can log in. Accounts with
              unverified email addresses will be restricted from accessing the Service.
            </p>
          </section>

          <section className="mb-4">
            <h4>4. Acceptable Use</h4>
            <p>You agree to use the Service only for lawful purposes. You must not:</p>
            <ul>
              <li>Upload receipts, files, or content that you do not have the right to share</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure</li>
              <li>Use the Service to store, transmit, or distribute malicious software</li>
              <li>Attempt to reverse engineer, decompile, or tamper with the Service</li>
              <li>Use the Service for any commercial purpose without prior written consent</li>
              <li>Create multiple accounts for the purpose of circumventing Free tier limitations</li>
            </ul>
          </section>

          <section className="mb-4">
            <h4>5. Free Tier Limitations</h4>
            <p>
              Free tier accounts are subject to a storage limit of <strong>10 receipts</strong>.
              When this limit is reached, you will not be able to upload or create additional
              receipts until existing receipts are deleted. A Premium tier with unlimited
              storage may be made available in the future.
            </p>
          </section>

          <section className="mb-4">
            <h4>6. Uploaded Content</h4>
            <p>
              You retain ownership of all receipts and files you upload to the Service.
              By uploading content, you grant WhereIsIt? a limited licence to store and
              process your files solely for the purpose of providing the Service to you.
              We will not share, sell, or disclose your uploaded files to third parties.
            </p>
            <p>
              You are solely responsible for the content you upload. You must not upload
              files that contain illegal, offensive, or harmful content.
            </p>
          </section>

          <section className="mb-4">
            <h4>7. Security</h4>
            <p>
              We take the security of your data seriously. The Service implements
              industry-standard security measures including:
            </p>
            <ul>
              <li>AES-256-GCM encryption for sensitive data stored in the database</li>
              <li>bcrypt password hashing with a cost factor of 12</li>
              <li>TOTP-based two-factor authentication</li>
              <li>Session timeouts after 30 minutes of inactivity</li>
              <li>HTTPS-enforced communication (in production environments)</li>
            </ul>
            <p>
              However, no system is completely secure. You acknowledge that you use the
              Service at your own risk and that we cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-4">
            <h4>8. Termination</h4>
            <p>
              You may delete your account at any time by contacting us. Upon account
              deletion, all your receipts, files, and personal data will be permanently
              removed from our systems.
            </p>
            <p>
              We reserve the right to suspend or terminate accounts that violate these
              Terms of Service, without prior notice.
            </p>
          </section>

          <section className="mb-4">
            <h4>9. Disclaimer of Warranties</h4>
            <p>
              The Service is provided on an "as is" and "as available" basis. As an academic
              project, we make no warranties of any kind, express or implied, regarding the
              availability, reliability, or fitness for a particular purpose of the Service.
              We do not guarantee that the Service will be uninterrupted or error-free.
            </p>
          </section>

          <section className="mb-4">
            <h4>10. Limitation of Liability</h4>
            <p>
              To the maximum extent permitted by applicable law, WhereIsIt? and its developers
              shall not be liable for any indirect, incidental, special, or consequential
              damages arising from your use of, or inability to use, the Service.
            </p>
          </section>

          <section className="mb-4">
            <h4>11. Changes to These Terms</h4>
            <p>
              We may update these Terms of Service from time to time. Continued use of the
              Service after any changes constitutes your acceptance of the revised terms.
              We will make reasonable efforts to notify users of significant changes.
            </p>
          </section>

          <section className="mb-4">
            <h4>12. Governing Law</h4>
            <p>
              These Terms of Service shall be governed by and construed in accordance with
              the laws of Ireland, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="mb-0">
            <h4>13. Contact</h4>
            <p className="mb-0">
              For any questions about these Terms of Service, please contact the project
              author at{' '}
              <a href="mailto:x22166971@student.ncirl.ie">x22166971@student.ncirl.ie</a>.
            </p>
          </section>

          <hr className="mt-4 mb-3" />
          <p className="text-muted small mb-0 text-center">
            WhereIsIt? - BSc Computing (Cybersecurity) Final Year Project —
            National College of Ireland, 2025/2026
          </p>

        </Card.Body>
      </Card>
    </Container>
  );
}

export default Terms;