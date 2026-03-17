# Changelog

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