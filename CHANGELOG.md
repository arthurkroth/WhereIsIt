# Changelog

## [0.8.1] - 11/07/2026 - Bug fixes and UI improvement.

### Fixed

#### Account Deletion — Wrong Password Causing Unintended Logout
- `deleteAccount` in `authController.js` returned HTTP `401` when the password confirmation was incorrect. The axios response interceptor in `api.js` treats any `401` from a non-login endpoint as an expired session and immediately clears the token and redirects to `/login`, so entering a wrong password was silently logging the user out instead of showing an error. Changed status code to `403` so the interceptor ignores it and the error reaches the frontend handler correctly
- `handleDeleteAccount` in `Profile.js` now calls `setDeletePassword('')` in the catch block, clearing the password field after a failed attempt so the user can type again without manually clearing it

#### Audit Log IP Addresses Not Being Recorded
- All audit log entries created via `AuditLogService.log()` were silently storing `NULL` for `ip_address` because the method had no IP parameter and used a 3-column INSERT. Only `adminController.js` (which used inline INSERT statements directly) was capturing IP addresses. Fixed by:
  - `AuditLogService.log()` updated to accept an optional fourth `ip` parameter; INSERT changed to include `ip_address` column
  - All 19 `audit.log()` call sites in `authController.js` updated to pass `req.ip` (covers REGISTER, EMAIL_VERIFIED, LOGIN_ATTEMPT, LOGIN_SUCCESS, ACCOUNT_LOCKED, MFA setup/confirm/disable, profile/email/password changes, support tickets, account deletion)
  - Inline INSERT statements in `authRoutes.js` (FORGOT_PASSWORD_REQUESTED, PASSWORD_RESET_SUCCESS), `receiptController.js` (RECEIPT_UPLOADED, RECEIPT_MANUAL_ENTRY, RECEIPT_UPDATED, RECEIPT_DELETED), and `premiumController.js` (PREMIUM_SETTINGS_UPDATED, RECEIPT_CSV_EXPORTED) updated to include `ip_address`
  - Cron-triggered entries in `warrantyAlertService.js` and `premiumExpiryService.js` correctly have no IP (no HTTP request context)
  - `app.set('trust proxy', 1)` is already in place, so `req.ip` correctly resolves the real client IP from the `X-Forwarded-For` header behind the nginx reverse proxy on AWS

#### Missing Warranty Field in OCR Upload Review
- The "Warranty (months)" field was extracted by OCR and sent correctly on save, but was never rendered in the upload review form — users had no way to see or correct the extracted value before saving. The two-column layout row (Purchase Date, Total Price) was changed to three columns (Purchase Date, Total Price, Warranty months), adding a number input (`min="0"` `max="120"`) bound to `reviewHeader.warrantyMonths`

### Changed

#### Profile Page — Premium Status Banner
- Premium subscription status moved from a card at the bottom of the Account Details tab to a slim persistent banner between the tab navigation and all tab content. The banner is now visible regardless of which profile tab is active, and shows the expiry date (or "Permanent — no expiry") on the right-hand side

#### Profile Page — Danger Zone Redesign
- Danger Zone removed from the Account Details tab body and replaced with a fixed bottom drawer anchored to the bottom of the viewport (respects the `--sidebar-width` CSS variable so it does not overlap the sidebar). Collapsed by default — shows only a thin `⚠ Danger Zone` bar. Clicking the bar slides the deletion form up with a CSS `max-height` transition. Closing the drawer resets the confirmation state, so it always starts fresh on next open. Confirmation form layout updated to an inline row (password field + action buttons side by side) to fit the compact drawer format


## [0.8.0] - 06/07/2026 - Unit testing, security hardening, Premium subscription flow, and submission polish.

### Added

#### Unit Testing
- Jest configured in `backend/package.json` with `npm test --coverage`. 4 test suites, 32 tests, all passing
- `src/__tests__/encryptionService.test.js` - 7 tests covering AES-256-GCM encrypt/decrypt round-trips, random IV uniqueness (same plaintext produces different ciphertexts), UTF-8 character handling, empty string edge case, and tampered-ciphertext resilience
- `src/__tests__/mfaService.test.js` - 6 tests covering TOTP secret generation format, `getOtpauthUrl` URL structure, and token verification (correct code, wrong code, and cross-secret rejection). Achieves 100% line and branch coverage on `mfaService.js`
- `src/__tests__/warrantyCalculations.test.js` - 10 tests covering `calculateWarrantyExpiry` (month arithmetic, rollover, zero-month warranty, output format) and `getWarrantyStatus` (expired, active, expiring-soon) and `getFileType` (pdf, image formats, null for manual entries, unknown extensions)
- `src/__tests__/authService.test.js` - 6 tests covering JWT structure validation (three-segment format), payload field correctness (userId, role, firstName, lastName), role-based expiry windows (FREE/PREMIUM ≈ 60 min, ADMIN ≈ 30 min), and rejection of tokens verified with the wrong secret
- `frontend/src/utils/format.test.js` - 21 tests covering `formatDate`, `formatDateTime`, `formatCurrency`, `getDaysLeft`, `getWarrantyStatus`, and `getStatusBadgeVariant` (including both frontend-computed labels and backend snake_case status strings)

#### Premium Subscription Flow
- `Upgrade to Premium` tab added to the Profile page (FREE users only) - two plan cards (1 Month: €4.99, 6 Months: €24.99), Revolut QR code rendered inline via `qrcode.react`, payment instructions including email-in-reference prompt, and an "I've sent the payment" button that pre-fills and navigates to the Contact Support tab
- Premium subscription status display in Account Details tab (PREMIUM users) showing expiry date or "Permanent" badge
- `backend/src/services/premiumExpiryService.js` - new daily cron (03:00 UTC) that reverts expired PREMIUM accounts to FREE and sends notification emails; also a monthly cron (1st of month, 04:00 UTC) that enforces the 2-year audit log data retention policy from the Privacy Policy
- Admin Change Tier modal updated with expiry date picker and "Permanently Premium" checkbox; Account Overview card now shows `premium_expires_at` and `premium_permanent` for PREMIUM users
- `emailService.sendPremiumExpiryWarning()` and `emailService.sendPremiumExpired()` - two new branded transactional emails sent 7 days before and on the day of subscription expiry respectively
- `users.premium_expires_at TIMESTAMP DEFAULT NULL` and `users.premium_permanent BOOLEAN NOT NULL DEFAULT FALSE` - two new database columns (run `ALTER TABLE users ADD COLUMN premium_expires_at TIMESTAMP DEFAULT NULL, ADD COLUMN premium_permanent BOOLEAN NOT NULL DEFAULT FALSE;` on any existing database)
- `DELETE /auth/account` backend endpoint - requires current password confirmation, writes `ACCOUNT_DELETED` audit log entry before deletion, then removes the user row (database CASCADE handles receipts, MFA codes, tickets, premium settings)
- Danger Zone section in Profile → Account Details - two-step confirmation UI (button → password field + warning) preventing accidental account deletion
- OCR processing time now logged to the backend console on every upload (`OCR processing time: 4.23s (FREE - tesseract)`) providing concrete data for the Non-Functional Requirements evaluation

#### Legal Documentation
- `Terms.js` - new Section 5a "Payments and Subscriptions" covering Revolut payment handling, manual activation process, no-refund policy, and explicit service-discontinuation risk warning for the academic project context
- `Privacy.js` - Section 7 updated to accurately reflect Resend email delivery and Revolut payment processing (replacing the stale Ethereal/Nodemailer reference); confirms no payment card data is stored by the application

### Changed
- Degraded users (were PREMIUM, reverted to FREE with >10 receipts) now see a descriptive error on upload: "You have X receipts stored. Free accounts are limited to 10. Delete existing receipts to upload more, or upgrade to Premium." - previously showed the same generic limit message as a user who had just reached 10
- Dashboard storage `ProgressBar` capped at 100% (`Math.min`) so degraded users with >10 receipts don't render an overflowing bar
- `adminChangeTier` in `api.js` updated to pass optional `expiresAt` and `permanent` fields
- `getProfile` (`authController.js`) and `getUserById` (`adminController.js`) now return `premiumExpiresAt` and `premiumPermanent` fields
- `backend/package.json` - `jest` added to `devDependencies`, `"test": "jest --coverage"` script added, Jest configuration block added (`testEnvironment: node`, `testMatch`, `collectCoverageFrom`)

### Fixed

#### Security - Stored HTML Injection in Admin Notification Emails
- `escapeHtml()` helper added to `adminController.js` and applied to all six email templates that previously interpolated user-controlled strings without sanitisation: `user.first_name` (tier change, suspension, reactivation, password reset, MFA reset emails) and `ticket.first_name`, `ticket.subject`, `response.trim()`, `ticket.status` (support ticket response email). A malicious user could craft a ticket subject containing `<script>` tags or spoofed HTML that would render in the admin's email client.

### Database Migrations
- `ALTER TABLE users ADD COLUMN premium_expires_at TIMESTAMP DEFAULT NULL` - tracks when a manually-granted Premium subscription expires
- `ALTER TABLE users ADD COLUMN premium_permanent BOOLEAN NOT NULL DEFAULT FALSE` - flags accounts that should never be auto-reverted by the expiry cron


## [0.7.0] - 20/06/2026 - UI redesign and security/vulnerability hardening.

### Added

#### UI Redesign
- `Sidebar.js` - new left-hand sidebar navigation with role-aware links (user/Premium/Admin), replacing the old top navbar. Collapses to a horizontal bar on mobile
- `global.css` - new design token system: CSS custom properties for brand colours (navy `#1B3F7A`, green `#3CB54A`), spacing, typography, radius, and shadows. Bootstrap CSS variables overridden so existing `variant="primary"`/`bg="success"` props pick up the brand palette automatically without per-component rewrites
- DM Sans font now actually loaded via Google Fonts `<link>` in `index.html` (previously referenced in the project proposal but never wired up)
- `Home.js` - new public landing page at `/` for signed-out visitors: hero section with animated gradient accents, feature cards, "how it works" steps, sticky frosted-glass nav bar. Replaces the previous behaviour of redirecting anonymous visitors straight to `/login` with no landing page at all
- `frontend/src/utils/format.js` - shared `formatDate`, `formatDateTime`, `formatCurrency`, `getWarrantyStatus`, `getDaysLeft`, `getStatusBadgeVariant`, `downloadBlob` helpers, replacing ~9 duplicated local implementations scattered across Dashboard, ReceiptList, ReceiptDetail, and the admin pages
- `.auth-shell` / `.auth-card` layout applied consistently across Login, Register, ForgotPassword, ResetPassword, MfaVerify, and VerifyEmail - centered card, branded logo, consistent spacing, replacing the previous plain unstyled forms

#### Account Security
- Account lockout after 5 failed login attempts - 30 minutes for FREE/PREMIUM accounts, 60 minutes for ADMIN accounts. Logged to `audit_logs` as `ACCOUNT_LOCKED`/`ACCOUNT_LOCKED_ATTEMPT`
- Email alert sent to every other ADMIN account when an admin account is locked out, via new `emailService.sendAdminLockoutAlert()`
- Cooldown after 3 failed MFA codes during login - 5 minute lockout (`429` response), logged as `MFA_LOGIN_LOCKED`. Login-time verification only; MFA setup confirmation is unaffected
- Role-based JWT session expiry - 60 minutes for regular users, 30 minutes for admins (`ADMIN_JWT_EXPIRES_IN`, configurable). Previously a single global expiry applied to everyone
- `SessionManager.js` - new logic-only component that tracks mouse/keyboard/scroll activity and force-logs-out the user after the matching inactivity window, mounted alongside the sidebar
- Per-email-address rate limiting (3 per rolling hour) on `resend-verification` and `forgot-password`, to stop those endpoints being used to spam a real victim's inbox now that email delivery is genuinely real

#### Email Delivery (Resend Integration)
- Real outbound email via the Resend API (`resend` npm package) - registration verification, password reset, admin notifications, ticket replies, and warranty alerts are now actually delivered to real inboxes
- `emailService.sendEmail({ to, subject, html })` - single shared method all outbound email now goes through, replacing ~8 call sites that each previously built their own Nodemailer/Ethereal transport call directly inside `adminController.js` and `warrantyAlertService.js`
- `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` environment variables - both required at startup, no fallback

#### Database & Deployment
- `backend/database/schema.sql` - consolidated, idempotent database setup script for fresh deployments (AWS RDS or otherwise). Folds the previously scattered `ALTER TABLE` migration fragments into the original `CREATE TABLE` statements, adds missing indexes (`support_tickets(user_id)`, `support_tickets(status)`, `audit_logs(action, created_at)`), and documents a safe optional admin-bootstrap insert

### Changed
- Every admin-triggered notification email (tier change, suspension, reactivation, password reset, MFA reset, ticket response) now goes through `emailService.sendEmail()` using one configurable "from" address, instead of hardcoded placeholder sender domains (`noreply@whereis.it`, `support@whereis.it`) that could never have passed real provider domain verification
- `backend/src/routes/receiptRoutes.js` - six manually try/catched route handlers converted to use the existing `asyncHandler` utility, matching the pattern already used in `authRoutes.js`/`adminRoutes.js`
- One-line explanatory comments added to every function across all touched frontend and backend files
- Full visual pass across every existing page (auth pages, dashboard, receipts, profile, all admin pages) - replaced inline hardcoded colours and `onMouseEnter`/`onMouseLeave` hover-shadow JS hacks with token-driven CSS classes (`.hover-card`, `.tag-pill`, `.landing-feature-icon`, etc.)

### Fixed
- **Email enumeration / information leak** - duplicate registration with an already-registered email threw an uncaught MySQL duplicate-key error straight through `errorMiddleware`, which echoed the raw DB error message (including the email address) back to the client in a `500` response. Now caught and returns a clean `409`
- **Password reset never sent an email in production** - the `forgot-password` handler only called `emailService.sendPasswordResetEmail()` inside an `if (NODE_ENV !== 'production')` block, so in a real deployment no email was ever sent at all, silently. The handler also returned the raw reset token and reset URL directly in the API response as a dev convenience, which leaked the token. Both fixed - the email always sends now, and the token is never returned in the response
- `Login.js` never read `location.state.message`, so `ResetPassword.js`'s "password reset successful" confirmation banner was silently never displayed after a successful reset. Fixed while wiring up the `SessionManager` inactivity-logout message, which uses the same mechanism
- Removed a broken `<i className="bi bi-shield-lock">` icon reference in `MfaVerify.js` - Bootstrap Icons was never actually loaded as a project dependency, so the icon never rendered

### Removed
- Dead/unused frontend pages with no remaining route or import: `Home.js` (old version, superseded), `MfaSetup.js` (duplicate of Profile's MFA tab), `Admin.js` (superseded by `AdminAuditLogs.js`), `Receipts.js` (superseded by `ReceiptList.js`), `UploadReceipt.js` (superseded by `ReceiptUpload.js`/`ReceiptManual.js`) - roughly 1,200 lines of dead code
- `Navbar.js` - replaced by `Sidebar.js`
- Ethereal/Nodemailer email sandbox entirely - Resend is now the only email path, with no local/fake fallback. `nodemailer` removed from `package.json` as it is no longer referenced anywhere
- All "Open Email Preview" buttons and `previewUrl` response fields across `adminController.js`, `premiumController.js`, `warrantyAlertService.js`, and the corresponding frontend pages (`AdminUserDetail.js`, `AdminSupportTickets.js`, `Profile.js`) - dead now that real email delivery has no preview link to show
- Redundant `idx_email` index in the `users` table schema - the existing `UNIQUE` constraint on `email` already creates one

### Security
- `npm audit` review confirmed the new `resend` dependency introduces zero new vulnerabilities. Removing `nodemailer` eliminated one pre-existing high-severity CVE (CRLF header injection / SSRF via the `raw` option) from the dependency tree outright - 8 pre-existing vulnerabilities down to 7, none newly introduced
- `backend/database/schema.sql` AWS RDS deployment review - fixed a database-name typo in the documented optional `GRANT` statement, corrected `@'localhost'` (which cannot work against a remote RDS host) to `@'%'`, and replaced no-op admin/premium role `UPDATE` statements (which silently affect 0 rows against a fresh database with no users yet) with a documented, safe bootstrap-admin option
- Audited the project's technical report use cases (account lockout thresholds, MFA cooldown, session timeout durations, email-enumeration protection) against the actual implementation and closed every gap found - see Added/Fixed above

## [0.6.0] - 18/06/2026 - Completed Admin use case.
 
### Added
 
#### Admin Dashboard
- `AdminDashboard.js` - new admin landing page with four stat cards (total users with Free/Premium breakdown, total receipts, open support tickets, suspended accounts) and a Recent Admin Actions table pulled from audit_logs
- Four navigation cards linking to User Management, Support Tickets, Audit Logs, and Reports
- Admins are redirected to `/admin/dashboard` on login instead of the user receipt dashboard - `HomeRedirect` and `DashboardRoute` components added to `App.js` for role-aware routing

#### User Management
- `AdminUsers.js` - user search and list page with filters for role (Free/Premium/Admin) and status (active/suspended). Search by email, name, or user ID
- `AdminUserDetail.js` - full user detail page showing account overview, receipt count, MFA status, remaining recovery codes, recent login history (last 10 from audit_logs), and account action history
- Five account action modals, all requiring a written reason and creating detailed audit log entries:
  - **Change Tier** - switches user between FREE and PREMIUM (min 10 char reason). Sends notification email to user
  - **Suspend Account** - marks account as suspended, blocks login (min 20 char reason). Sends suspension email
  - **Reactivate Account** - lifts a suspension (min 10 char reason). Sends reactivation email
  - **Send Password Reset** - generates a 24-hour reset token and emails it to the user (min 10 char reason)
  - **Reset MFA** - highest-security action: clears MFA secret and invalidates all recovery codes. Requires min 50 char justification and admin must re-enter their own password. Sends urgent security notification to user

#### Support Ticket Management
- `AdminSupportTickets.js` - ticket list with status and priority filters, sorted open/high-priority first. Includes a "Replied" badge in the table when the user has sent a reply
- Ticket detail modal shows the full conversation thread: user's original message → previous admin response → user reply (highlighted in amber) → response form
- Admin can respond to tickets and change status (Open, In Progress, Resolved). Response emails sent to user via Nodemailer/Ethereal
- "Create Test Ticket" button allows admins to create tickets on behalf of any user ID for demo and testing purposes

#### User-Facing Support Tickets
- **Contact Support** tab added to Profile page (5th tab, available to all authenticated users)
- Submit new ticket form with subject, priority selector (Low/Medium/High), and message body
- Ticket history panel shows all submitted tickets with status/priority badges and admin responses
- **User reply flow** - when an admin has responded and the ticket is not yet resolved, a reply textarea appears in the ticket history. The user can send a follow-up reply which re-opens the ticket to In Progress status so the admin knows a reply is waiting
- New backend endpoints: `POST /auth/support`, `GET /auth/support`, `PUT /auth/support/:id`

#### Enhanced Audit Logs
- `AdminAuditLogs.js` - full replacement of the previous basic version
- Filters: free-text search, event type dropdown (populated from unique actions in the dataset), user ID, date range (from/to), entry limit (50/100/250/500)
- Severity colour-coding: red rows for critical events (suspensions, failures, MFA resets), amber for security events (admin actions, logins, MFA), grey for standard info events
- User ID cells are clickable links that navigate directly to that user's detail page
- IP address column included for all events

#### Scheduled Reports
- `reportService.js` - new service that generates `.log` report files saved to `backend/reports/`
- Report content includes five sections: System Summary (user counts by role, receipts, tickets), New Users in Period, Security Events (unauthorized access attempts, failed MFA, suspensions, MFA resets), Admin Actions (all ADMIN\_ prefixed events), Full Audit Log (up to 1000 entries with timestamps and IPs)
- On-demand generation via admin panel (generates immediately using the configured frequency period)
- Scheduled generation via `node-cron` running at 01:00 UTC daily - checks `report_schedule` table and generates when due based on frequency setting
- Three frequency modes: Daily (every run), Weekly (every 7 days), Monthly (every 30 days)
- `AdminReports.js` - new admin page with schedule enable/disable toggle, frequency selector, last run timestamp, "Generate Report Now" button, and a list of saved `.log` files with size and download buttons
- Download triggered client-side via blob URL - files are named `WhereIsIt_Report_YYYY-MM-DD_HH-MM-SS.log`
- Reports card added to Admin Dashboard navigation
- Reports link added to Admin Panel dropdown in Navbar
- `server.js` updated to start the report scheduler on startup alongside the warranty alert service
- `report_schedule` table created to persist schedule configuration

#### Unauthorized Access Logging
- `authMiddleware.js` `requireRole` function updated to be async and log an `UNAUTHORIZED_ACCESS_ATTEMPT` audit entry (with user ID, attempted path, required role, and IP address) before returning 403. This satisfies the admin spec requirement for security event logging - the attempt is logged server-side and cannot be bypassed

### Changed
- `App.js` - Navbar is now conditionally rendered only when the user is authenticated (not shown on login, register, or public pages). Content area has `paddingTop: 1.5rem` to clear the sticky navbar
- `App.js` - `DashboardRoute` component redirects ADMIN-role users to `/admin/dashboard` if they land on `/dashboard` (e.g. from a post-login redirect)
- `Navbar.js` - admin users see an "Admin Panel" dropdown with links to Dashboard, User Management, Support Tickets, Audit Logs, and Reports (separated by a divider). The logout function now correctly calls `logoutUser()` from `AuthContext` (was previously referencing the non-existent `logout`)
- `adminController.js` `listAuditLogs` - `LIMIT` value is now inlined as a sanitised integer rather than a `?` placeholder, fixing MySQL driver compatibility issues with parameterised LIMIT values
- `AdminSupportTickets.js` - admin response text field now starts empty when opening a ticket (was pre-populated with the previous response). Previous admin response is still visible as a read-only card above the input
- `Dashboard.js` - "Premium - Unlimited Storage" badge is now shown only for PREMIUM role users; ADMIN users no longer incorrectly see the Premium storage banner

### Fixed
- Suspended account login blocking - `authController.js` `login()` now checks `user.status === 'suspended'` after password validation and before MFA check, returning 403 with `accountSuspended: true` if the account is suspended
- `Navbar.js` runtime error "logout is not a function" - `AuthContext` exports `logoutUser`, not `logout`. Previous Navbar used the wrong name, causing a crash on logout and silently corrupting the render tree when navigating to admin user detail pages
- `AdminAuditLogs.js` 500 error - `ip_address` column did not exist in `audit_logs` table and MySQL rejected `?` as a `LIMIT` placeholder. Fixed by running `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) DEFAULT NULL` and inlining the sanitised limit

### Database Migrations
- `ALTER TABLE users ADD COLUMN status ENUM('active','suspended') NOT NULL DEFAULT 'active'` - supports account suspension
- `CREATE TABLE support_tickets (...)` - full ticket schema with status, priority, admin response, responded_by, created_at, updated_at
- `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) DEFAULT NULL` - enables IP address logging on all audit events
- `ALTER TABLE support_tickets ADD COLUMN user_reply TEXT DEFAULT NULL, ADD COLUMN user_replied_at TIMESTAMP DEFAULT NULL` - supports user replies to admin responses
- `CREATE TABLE report_schedule (...)` with seed row `INSERT INTO report_schedule (id, enabled, frequency) VALUES (1, FALSE, 'weekly')` - persists report schedule configuration


## [0.5.0] - 01/06/2026 - Completed Premium User use case + CI/CD security pipeline.

### Added

#### Premium OCR - OpenAI GPT-4o-mini
- `openaiService.js` - new service that routes Premium receipt processing to OpenAI GPT-4o-mini. Images are sent directly to the Vision API as base64; PDFs have text extracted via pdf-parse first, then sent to the text API for structured extraction
- Premium users always receive OpenAI-powered OCR on upload. Free users always use the local Tesseract engine (no change to Free behaviour)
- Automatic fallback to Tesseract if OpenAI is unavailable (quota exceeded, network error, API outage). A warning banner is shown in the upload review step when fallback occurs, informing the user that AI OCR was temporarily unavailable
- `ocrService.js` updated - `processReceipt()` now accepts a `userRole` parameter and routes accordingly. The fallback result carries `aiProviderError: true` and `aiProviderMessage` which propagate through to the frontend
- `receiptController.js` updated - passes `req.user.role` to the OCR service so routing is role-aware; returns `aiProviderError` and `aiProviderMessage` in the upload response; OCR method logged as `openai` or `tesseract` in audit trail
- `ReceiptUpload.js` updated - three distinct OCR result banners: AI-enhanced success, AI provider fallback warning, and standard OCR difficulty. AI fallback banner shows the specific reason so users know to review the extracted fields carefully

#### Premium Settings and Warranty Alerts
- New `premium_settings` database table - stores per-user alert preferences: `alerts_enabled`, `alert_timeframe_days` (7/14/30/60/90), `alert_frequency` (daily/weekly/immediate), `last_alert_sent`
- `premiumController.js` - new controller handling settings GET/PUT, CSV export, and test alert trigger
- `premiumRoutes.js` - new `/premium/` route group, all endpoints require PREMIUM or ADMIN role via `requirePremium` middleware
- `app.js` updated - registers `/premium` route group
- Profile page updated - new **★ Premium Settings** tab (visible to PREMIUM users only) with alert enable/disable toggle, timeframe dropdown, frequency dropdown, last alert sent timestamp, Save Preferences button, and **Send Test Alert** button
- Send Test Alert returns an Ethereal email preview URL directly in the UI as a clickable "Open Email Preview" button - no longer requires checking the backend console
- `warrantyAlertService.js` - automated warranty alert background service using `node-cron`. Runs at midnight UTC daily. For each Premium user with alerts enabled, queries receipts expiring within their configured timeframe and sends an appropriate email
- Daily digest mode: one email listing all expiring items in a formatted table
- Weekly summary mode: same as daily but only sends on Mondays
- Immediate mode: one individual email per expiring item
- `runTestAlertForUser(userId)` function - uses a 365-day window to guarantee the test always finds receipts. Falls back to a sample test email if the user has no receipts at all
- `server.js` updated - calls `startWarrantyAlertService()` on startup after the database health check

#### CSV Export
- `GET /premium/export/csv` endpoint - decrypts all store names, notes, and product descriptions server-side; fetches all receipt items per receipt; calculates warranty expiry and status for each row; returns a downloadable `.csv` file
- CSV includes: Receipt ID, Store Name, Purchase Date, Product(s), Total Price (€), Warranty (months), Warranty Expiry, Warranty Status, Tags, Notes, Has File, OCR Confidence, Added On
- UTF-8 BOM prepended to file for correct character rendering when opened in Microsoft Excel
- Export CSV button added to both Dashboard and Receipt List pages for Premium users. Handled client-side via blob URL to trigger a browser download without a page redirect
- Filename includes the current date: `WhereIsIt_Receipts_YYYY-MM-DD.csv`

#### Advanced Filters (Premium)
- Receipt List updated - new collapsible **★ Premium Filters** section shown only to PREMIUM users
- **Warranty expiring within** filter: 7, 30, 60, or 90 days
- **Price category** filter: Under €50, €50-€200, €200-€500, Over €500
- **File type** filter: Image receipts (JPG/PNG), PDF receipts, Manual entries (no file)
- Free users see an upgrade prompt in place of the Premium filters section
- `fileType` field (`'pdf'` | `'image'` | `null`) added to the `listReceipts` API response to support the file type filter

#### Dashboard - Premium Display
- Premium users see a **"★ Premium - Unlimited Storage"** badge in place of the storage progress bar
- Storage info from `listReceipts` response now includes `unlimited: true` for Premium users so the frontend can branch display logic without a separate role check
- Warranty alert section on Dashboard links to Profile alert preferences for Premium users

#### CI/CD Security Pipeline
- CircleCI pipeline updated from `npm ci` to `npm install` to support environments without a committed lock file
- **Gitleaks** (v8.18.0) secret scanning job added - scans all repository files for accidentally committed credentials, API keys, tokens, and private keys. Hard fail: pipeline stops if any secrets are detected
- `.gitleaks.toml` added to repository root - suppresses false positives in markdown documentation files (`.md` extension) which contain example AWS credential placeholders
- **Semgrep SAST** job added - static application security testing against four rule sets: `p/nodejs` (Node.js security patterns), `p/jwt` (JWT misuse), `p/owasp-top-ten` (OWASP A01-A10:2021), `p/nodejsscan` (additional Node.js checks). Applied to both backend and frontend source. Reports findings without blocking merges
- **OWASP Dependency-Check** (v9.0.9) job added - deep CVE scan against the full National Vulnerability Database, more thorough than `npm audit`. Produces an HTML report saved as a CircleCI build artifact (Artifacts tab after each run). Fails only on CVSS score ≥ 9 (critical). Accepts optional `NVD_API_KEY` environment variable to avoid NVD rate limiting in CI environments
- All five pipeline jobs (backend-checks, frontend-checks, secret-scan, sast-scan, dependency-check) run in parallel on the `dev` branch only

### Changed
- Storage limit enforcement moved to role-aware helper `checkStorageLimit(userId, role)` - Premium users always pass the check; Free users are limited to 10 receipts. This removes the previous hard-coded check in upload and manual creation endpoints
- `api.js` - `getAuditLogs` updated to accept a filters object and build query parameters dynamically, replacing the previous no-argument call
- Premium Settings tab in Profile is conditionally rendered - only PREMIUM users see it; Free and Admin users do not

### Fixed
- `sendTestAlert` in `premiumController.js` was importing `runDailyWarrantyCheck` but never calling it, causing the test alert button to return a success message without sending any email. Fixed by adding `runTestAlertForUser` to `warrantyAlertService.js` and wiring it up correctly in the controller
- `warrantyAlertService.js` `sendAlertEmail` was logging the Ethereal preview URL to the console only. Updated to return it from the function so callers can pass it back through the API response and display it in the UI
- `ReceiptList.js` ESLint warning - `useEffect` for fetching receipts was missing `isPremium` from its dependency array. Suppressed with `// eslint-disable-next-line react-hooks/exhaustive-deps` as `isPremium` does not need to trigger a re-fetch (role-based filtering happens in a separate effect)
- OWASP Dependency-Check pipeline job failing with "Invalid 'out' argument: path does not exist" - fixed by adding `mkdir -p dependency-check-report` before running the scan
- OWASP Dependency-Check failing with NVD 403/404 errors in CI due to shared IP rate limiting - fixed by adding `--nvdApiDelay 6000` and `no_output_timeout: 30m` to the scan step

## [0.4.0] - 25/04/2026 - Completed Free User use case.

### Added
- Email verification - new users must verify their email address before logging in. Verification link sent via Nodemailer/Ethereal Email (development mode), with preview URL logged to the backend console
- `emailService.js` - new Nodemailer-based email service using Ethereal fake SMTP for local development. Handles verification emails and password reset emails
- `VerifyEmail.js` - new page that handles the verification link from email, with distinct states for success, already verified, expired, and error
- Resend verification email - users who attempt to log in with an unverified account are shown a warning with a "Resend verification email" button
- Terms of Service page (`/terms`) - accessible from the registration form, opens in a new tab
- Privacy Policy page (`/privacy`) - accessible from the registration form, opens in a new tab. Covers GDPR rights, data collected, security measures, and data retention.
- Terms of Service and Privacy Policy acceptance checkbox on the Register page - account creation is blocked until the checkbox is ticked
- MFA recovery codes - 8 codes generated on MFA setup, displayed once in a modal with copy-to-clipboard. Each code is SHA-256 hashed before storage in new `mfa_recovery_codes` table
- Recovery code login - users can enter a recovery code instead of a TOTP token on the MFA verification step. Used codes are marked as consumed immediately
- "Can't scan QR code" fallback on Profile MFA setup - reveals the TOTP secret as plain text for manual entry into authenticator apps
- Remaining recovery code count shown on Profile Security tab
- CAPTCHA challenge after 3 failed login attempts - server-generated math question, no external service required. Single-use, expires after 5 minutes
- Notes field on receipts - free-text, AES-256-GCM encrypted at rest, max 1000 characters. Shown on list, detail, upload review, and manual entry pages
- Tags on receipts - predefined clickable labels (Electronics, Appliances, Furniture, etc.), stored as JSON, shown as pills on dashboard, list, and detail pages
- `TagSelector` component - reusable tag toggle UI used across Upload, Manual, and Detail pages
- Free tier storage limit enforcement (10 receipts) - checked on both upload and manual creation before processing
- Storage usage progress bar on Dashboard - colour changes green > yellow > red as usage approaches limit. Warning alert at 80%, hard block at 100%
- Warranty expiry alert banner on Dashboard - shown when any receipt warranty expires within 30 days, with days remaining countdown on each card
- Summary stats cards on Dashboard - Total Receipts, Active Warranties, Expiring Soon, Expired
- Download button on Receipt Detail page file preview
- Session timeout - silent logout after 30 minutes of inactivity via `SessionManager` component in `App.js`
- Date range, price range, tag, and sort filters in Receipt List
- Password strength indicator on Register page - live progress bar and unmet requirements list as the user types
- New backend endpoints: `GET /auth/captcha`, `GET /auth/verify-email`, `POST /auth/resend-verification`, `DELETE /auth/mfa`
- New database columns: `email_verified`, `email_verification_token`, `email_verification_expires` on `users` table; `notes_enc` and `tags` on `receipts` table
- New database table: `mfa_recovery_codes`

### Changed
- Password requirements updated to match specification: minimum 12 characters, uppercase, lowercase, number, and special character (previously min 10, no complexity rules)
- Register page - after successful registration, user stays on the page and sees a message to check their email rather than being redirected immediately to login
- Login page - MFA step now clearly explains both the 6-digit TOTP code and recovery code options, with format hint (XXXXXX-XXXXXX-XXXXXX)
- `changeEmail` - changing email now resets `email_verified` to FALSE and sends a new verification email to the new address
- Dashboard receipt cards - store name is now the primary title, item description is the subtitle beneath it
- Search in Receipt List now also matches against the notes field

### Fixed
- Login always failing with "Invalid email or password" on new accounts - `login()` in `api.js` was sending `captchaId: null` and `captchaAnswer: null` on every request, which failed Zod's `.optional()` validation before credentials were ever checked. Fixed by only including captcha fields when they have a value, and changing schema to `.nullish()`
- Email verification link showing "Link Expired" immediately after clicking - caused by React 18 StrictMode running `useEffect` twice, which fired the verify API call twice. First call succeeded and cleared the token; second call found no token and returned expired. Fixed with a `useRef` guard in `VerifyEmail.js` and a backend check for already-verified accounts


## [0.3.0] - 22/03/2026

### Added
- Multi-item receipt support - receipts now store multiple line items. New `receipt_items` table added to the database with `ON DELETE CASCADE` from `receipts`
- Profile page (`/profile`) - users can update their first/last name, change their email address, change their password, and manage MFA all from a single tabbed page
- MFA management in Profile - MFA setup and disable moved from the standalone `/mfa-setup` page into the Security tab of the Profile page, with live enabled/disabled badge indicator
- Split-screen receipt review - after OCR upload, the review step now shows the edit form on the left and the original receipt image/PDF on the right with zoom in/out/reset controls (50%-300%)
- OCR: IKEA invoice support - detects invoice documents via `Buyer:`/`Seller:` labels, finds the product table header row, skips column sub-headers, and parses article-number lines correctly
- OCR: Generic invoice support (e.g. Fanatec) - detects `Supplier`/`Client` labels for store name extraction, handles multi-column price layouts where the last column is a tax amount, strips SKU/reference metadata from product descriptions
- OCR: Quality fallback - if more than half the extracted items have no price, the list collapses to a single placeholder item, giving the user a clean form to fill in rather than a list of wrong items
- Auto-calculated total price - when editing a receipt, the Total Price field automatically recalculates whenever items are added, removed, or their prices are changed
- New backend endpoints: `GET /auth/profile`, `PUT /auth/profile`, `PUT /auth/change-email`, `PUT /auth/change-password`, `DELETE /auth/mfa`

### Changed
- Dashboard - receipt cards now show `totalPrice` and `firstItemDescription` instead of the old single `price` and `productDescription` fields. Cards are now clickable and navigate to the receipt detail page
- Receipt list - Items column shows the first item description with a `+N more items` hint when multiple items exist. Total column uses `totalPrice`
- Receipt detail - product field replaced with a full line items table in view mode and editable item cards in edit mode. PDF preview now hides the browser's built-in pages panel and toolbar
- Receipt upload - review step now includes a visible Total Price field so users can see and correct the OCR-extracted total before saving
- Navbar - "MFA Setup" link replaced with "Profile"
- App.js - removed `container` CSS class from the page wrapper so the split-screen review can use full browser width. Each page now manages its own container width
- OCR store name extraction - now searches backwards from `Seller:` label for IKEA invoices, and forwards from `Supplier` label for generic invoices
- OCR total price extraction - `Total Incl. Tax` and `Amount Paid` are now checked before the generic `total` pattern, and `Total Excl. Tax` is explicitly excluded to avoid capturing the pre-tax amount

### Fixed
- Receipt detail edit form showing blank purchase date - MySQL timestamps are now converted to `YYYY-MM-DD` before populating the HTML date input
- Dashboard showing `€0.00` total value - was reading the old `price` field instead of `totalPrice`
- IKEA OCR extracting 18 address/metadata lines as products - fixed by detecting invoice document type and starting extraction only after the product table header row
- IKEA OCR total showing `€7` instead of `€227` - fixed by using `matchAll` to find the last euro-signed price on the Invoice Total line
- IKEA OCR stopping at `"Total Price VAT"` column sub-header - fixed by checking column sub-headers before soft stop keywords in the extraction loop
- Schuh receipt extracting `"Size : UK 7"` and `"STUDENT CARD 10%"` as products - restored `size`, `student card`, `colour`, `loyalty card` to the skip keywords list
- Save receipt failing with 500 error when purchase date was empty in edit mode

## [0.2.0] - 17/03/2026

### Added
- Receipt detail page with view, edit, and delete functionality
- Clickable receipt rows navigating to detail page
- Receipt image preview via secure blob URL
- PDF preview via blob URL and embed tag
- OCR review and confirm step before saving (users can correct extracted data)
- Backend routes: GET /receipts/:id and GET /receipts/:id/file
- Auth middleware updated to accept JWT via query parameter for file serving
- Image preprocessing with sharp (upscale, greyscale, normalise, threshold, sharpen)
- .vscode/settings.json to suppress false node_modules errors

### Fixed
- express-rate-limit startup ValidationError (added trust proxy to app.js)
- Receipt upload Unexpected field error (field name mismatch in api.js)
- NaN price and Invalid Date on receipts list and dashboard
- PDF parsing by installing correct pdf-parse version (1.1.1)

### Improved
- OCR parsing logic (better store name, product, price, and date extraction)
- Footer line detection to skip legal and noise text from receipts
- Product extraction skip keywords (assistant, barcode, size, less discount)

## [0.1.0] - Initial Setup 20/01/2026

### Added
- User authentication with JWT
- Multi-factor authentication (TOTP)
- Receipt upload with Tesseract OCR
- Receipt list with search and filter
- Dashboard with statistics
- Encrypted storage of sensitive receipt fields
- Admin audit logs