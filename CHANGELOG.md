# Changelog

## [0.3.0] - 22/03/2026

### Added
- Multi-item receipt support — receipts now store multiple line items. New `receipt_items` table added to the database with `ON DELETE CASCADE` from `receipts`
- Profile page (`/profile`) — users can update their first/last name, change their email address, change their password, and manage MFA all from a single tabbed page
- MFA management in Profile — MFA setup and disable moved from the standalone `/mfa-setup` page into the Security tab of the Profile page, with live enabled/disabled badge indicator
- Split-screen receipt review — after OCR upload, the review step now shows the edit form on the left and the original receipt image/PDF on the right with zoom in/out/reset controls (50%–300%)
- OCR: IKEA invoice support — detects invoice documents via `Buyer:`/`Seller:` labels, finds the product table header row, skips column sub-headers, and parses article-number lines correctly
- OCR: Generic invoice support (e.g. Fanatec) — detects `Supplier`/`Client` labels for store name extraction, handles multi-column price layouts where the last column is a tax amount, strips SKU/reference metadata from product descriptions
- OCR: Quality fallback — if more than half the extracted items have no price, the list collapses to a single placeholder item, giving the user a clean form to fill in rather than a list of wrong items
- Auto-calculated total price — when editing a receipt, the Total Price field automatically recalculates whenever items are added, removed, or their prices are changed
- New backend endpoints: `GET /auth/profile`, `PUT /auth/profile`, `PUT /auth/change-email`, `PUT /auth/change-password`, `DELETE /auth/mfa`

### Changed
- Dashboard — receipt cards now show `totalPrice` and `firstItemDescription` instead of the old single `price` and `productDescription` fields. Cards are now clickable and navigate to the receipt detail page
- Receipt list — Items column shows the first item description with a `+N more items` hint when multiple items exist. Total column uses `totalPrice`
- Receipt detail — product field replaced with a full line items table in view mode and editable item cards in edit mode. PDF preview now hides the browser's built-in pages panel and toolbar
- Receipt upload — review step now includes a visible Total Price field so users can see and correct the OCR-extracted total before saving
- Navbar — "MFA Setup" link replaced with "Profile"
- App.js — removed `container` CSS class from the page wrapper so the split-screen review can use full browser width. Each page now manages its own container width
- OCR store name extraction — now searches backwards from `Seller:` label for IKEA invoices, and forwards from `Supplier` label for generic invoices
- OCR total price extraction — `Total Incl. Tax` and `Amount Paid` are now checked before the generic `total` pattern, and `Total Excl. Tax` is explicitly excluded to avoid capturing the pre-tax amount

### Fixed
- Receipt detail edit form showing blank purchase date — MySQL timestamps are now converted to `YYYY-MM-DD` before populating the HTML date input
- Dashboard showing `€0.00` total value — was reading the old `price` field instead of `totalPrice`
- IKEA OCR extracting 18 address/metadata lines as products — fixed by detecting invoice document type and starting extraction only after the product table header row
- IKEA OCR total showing `€7` instead of `€227` — fixed by using `matchAll` to find the last euro-signed price on the Invoice Total line
- IKEA OCR stopping at `"Total Price VAT"` column sub-header — fixed by checking column sub-headers before soft stop keywords in the extraction loop
- Schuh receipt extracting `"Size : UK 7"` and `"STUDENT CARD 10%"` as products — restored `size`, `student card`, `colour`, `loyalty card` to the skip keywords list
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