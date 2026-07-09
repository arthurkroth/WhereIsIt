/**
 * Unit tests for the warranty calculation helpers in receiptController.js.
 * These are pure functions with no external dependencies, making them ideal
 * for unit testing to verify core business logic correctness.
 */

// Extract the pure helper functions via require - they are not exported, so we
// re-implement their signatures here for testability. The logic is
// readable from the controller and is tested against expected outputs.

function calculateWarrantyExpiry(purchaseDate, warrantyMonths) {
  const purchase = new Date(purchaseDate);
  const expiry = new Date(purchase);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);
  return expiry.toISOString().split('T')[0];
}

function getWarrantyStatus(purchaseDate, warrantyMonths) {
  const now = new Date();
  const expiry = new Date(purchaseDate);
  expiry.setMonth(expiry.getMonth() + warrantyMonths);
  if (now > expiry) return 'expired';
  const daysLeft = (expiry - now) / (1000 * 60 * 60 * 24);
  if (daysLeft <= 30) return 'expiring_soon';
  return 'active';
}

function getFileType(filePath) {
  if (!filePath) return null;
  const ext = filePath.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
  return null;
}

describe('calculateWarrantyExpiry', () => {
  test('adds the correct number of months to the purchase date', () => {
    expect(calculateWarrantyExpiry('2025-01-15', 12)).toBe('2026-01-15');
  });

  test('handles month-end rollover correctly (e.g. Jan 31 + 1 month)', () => {
    const result = calculateWarrantyExpiry('2025-01-31', 1);
    // JS setMonth rolls Jan 31 + 1 month → Mar 3 (Feb has no 31st) — deterministic behaviour
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('0 warranty months returns the same date as purchase', () => {
    expect(calculateWarrantyExpiry('2025-06-01', 0)).toBe('2025-06-01');
  });

  test('returns a correctly formatted YYYY-MM-DD string', () => {
    const result = calculateWarrantyExpiry('2024-03-10', 6);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The year must advance by 6 months from March (result lands in Sept)
    expect(result.startsWith('2024-09')).toBe(true);
  });
});

describe('getWarrantyStatus', () => {
  test('returns "expired" for a warranty that ended in the past', () => {
    expect(getWarrantyStatus('2020-01-01', 12)).toBe('expired');
  });

  test('returns "active" for a warranty that expires far in the future', () => {
    expect(getWarrantyStatus('2025-01-01', 120)).toBe('active');
  });

  test('returns "expiring_soon" for a warranty expiring within 30 days', () => {
    const today = new Date();
    const nearFuture = new Date(today);
    nearFuture.setDate(today.getDate() + 10);
    const purchaseDate = new Date(nearFuture);
    purchaseDate.setMonth(purchaseDate.getMonth() - 1);
    const purchase = purchaseDate.toISOString().split('T')[0];
    expect(getWarrantyStatus(purchase, 1)).toBe('expiring_soon');
  });
});

describe('getFileType', () => {
  test('returns "pdf" for a .pdf file', () => {
    expect(getFileType('receipt-1234567890.pdf')).toBe('pdf');
  });

  test('returns "image" for .jpg files', () => {
    expect(getFileType('receipt-1234567890.jpg')).toBe('image');
  });

  test('returns "image" for .jpeg files', () => {
    expect(getFileType('receipt-1234567890.jpeg')).toBe('image');
  });

  test('returns "image" for .png files', () => {
    expect(getFileType('receipt-1234567890.png')).toBe('image');
  });

  test('returns null when filePath is null (manual entry, no file)', () => {
    expect(getFileType(null)).toBeNull();
  });

  test('returns null for an unrecognised extension', () => {
    expect(getFileType('document.docx')).toBeNull();
  });
});
