# Changelog

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