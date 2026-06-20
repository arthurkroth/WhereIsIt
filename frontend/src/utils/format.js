/**
 * File: format.js
 * WhereIsIt Project
 *
 * Shared formatting and warranty-status helpers used across multiple pages:
 * Dashboard.js, ReceiptList.js, ReceiptDetail.js, and the admin pages,
 * which each previously redefined their own copies.
 */

// Formats a date string for display, e.g. "18 Jun 2026". Returns a fallback for invalid/missing dates.
export function formatDate(dateString, options = {}) {
  if (!dateString) return options.fallback ?? 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return options.fallback ?? 'N/A';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', ...options
  });
}

// Formats a date string with time, e.g. "18 Jun 2026, 14:30". Used on admin/audit pages.
export function formatDateTime(dateString, options = {}) {
  if (!dateString) return options.fallback ?? '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return options.fallback ?? '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', ...options
  });
}

// Formats a number as a euro amount, e.g. "€12.50". Returns €0.00 for invalid input.
export function formatCurrency(amount) {
  const parsed = parseFloat(amount);
  return isNaN(parsed) ? '€0.00' : `€${parsed.toFixed(2)}`;
}

// Determines whether a warranty is Active, Expiring Soon, or Expired based on its expiry date.
export function getWarrantyStatus(expiryDate) {
  const daysLeft = getDaysLeft(expiryDate);
  if (daysLeft < 0) return 'Expired';
  if (daysLeft <= 30) return 'Expiring Soon';
  return 'Active';
}

// Calculates the number of days remaining until a warranty expiry date (negative if already expired).
export function getDaysLeft(expiryDate) {
  return Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
}

// Maps a warranty status string to a Bootstrap badge variant colour.
// Accepts both frontend-computed ("Expiring Soon") and backend ("expiring_soon") formats.
export function getStatusBadgeVariant(status) {
  const normalized = status?.toLowerCase().replace('_', ' ');
  if (normalized === 'active') return 'success';
  if (normalized === 'expiring soon') return 'warning';
  if (normalized === 'expired') return 'danger';
  return 'secondary';
}

// Triggers a browser download of a Blob with the given filename, then cleans up the object URL.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
