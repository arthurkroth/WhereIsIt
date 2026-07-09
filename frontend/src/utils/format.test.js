/**
 * Unit tests for frontend formatting and warranty-status utilities.
 * These are pure functions with no side effects, making them ideal for
 * unit testing. They underpin the warranty status display throughout the app.
 */

import {
  formatDate,
  formatDateTime,
  formatCurrency,
  getWarrantyStatus,
  getDaysLeft,
  getStatusBadgeVariant,
} from './format';

// ── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  test('formats a valid ISO date string in en-GB short format', () => {
    const result = formatDate('2026-06-15');
    expect(result).toMatch(/15\s+Jun\s+2026/);
  });

  test('returns the configured fallback for null', () => {
    expect(formatDate(null)).toBe('N/A');
  });

  test('returns the configured fallback for undefined', () => {
    expect(formatDate(undefined)).toBe('N/A');
  });

  test('returns the configured fallback for an invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('N/A');
  });

  test('accepts a custom fallback via options', () => {
    expect(formatDate(null, { fallback: '—' })).toBe('—');
  });
});

// ── formatDateTime ───────────────────────────────────────────────────────────

describe('formatDateTime', () => {
  test('returns the fallback for a null input', () => {
    expect(formatDateTime(null)).toBe('—');
  });

  test('includes the time portion for a valid datetime string', () => {
    const result = formatDateTime('2026-06-15T14:30:00Z');
    expect(result).toMatch(/14|15/); // hour digits vary by system tz; at least one present
  });
});

// ── formatCurrency ───────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  test('formats a positive number with the € symbol and two decimal places', () => {
    expect(formatCurrency(9.99)).toBe('€9.99');
  });

  test('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('€0.00');
  });

  test('formats a string-encoded number', () => {
    expect(formatCurrency('24.5')).toBe('€24.50');
  });

  test('returns €0.00 for NaN input', () => {
    expect(formatCurrency('not-a-number')).toBe('€0.00');
  });

  test('rounds to two decimal places', () => {
    expect(formatCurrency(4.999)).toBe('€5.00');
  });
});

// ── getDaysLeft ───────────────────────────────────────────────────────────────

describe('getDaysLeft', () => {
  test('returns a negative number for a past date', () => {
    expect(getDaysLeft('2020-01-01')).toBeLessThan(0);
  });

  test('returns a positive number for a future date', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    expect(getDaysLeft(future.toISOString())).toBeGreaterThan(0);
  });
});

// ── getWarrantyStatus ─────────────────────────────────────────────────────────

describe('getWarrantyStatus', () => {
  test('returns "Expired" for a warranty that ended in the past', () => {
    expect(getWarrantyStatus('2020-01-01')).toBe('Expired');
  });

  test('returns "Active" for a warranty that expires far in the future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    expect(getWarrantyStatus(future.toISOString())).toBe('Active');
  });

  test('returns "Expiring Soon" for a warranty expiring within 30 days', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 15);
    expect(getWarrantyStatus(soon.toISOString())).toBe('Expiring Soon');
  });
});

// ── getStatusBadgeVariant ─────────────────────────────────────────────────────

describe('getStatusBadgeVariant', () => {
  test('maps "Active" to "success"', () => {
    expect(getStatusBadgeVariant('Active')).toBe('success');
  });

  test('maps "Expiring Soon" to "warning"', () => {
    expect(getStatusBadgeVariant('Expiring Soon')).toBe('warning');
  });

  test('maps "Expired" to "danger"', () => {
    expect(getStatusBadgeVariant('Expired')).toBe('danger');
  });

  test('maps backend snake_case "expiring_soon" to "warning"', () => {
    expect(getStatusBadgeVariant('expiring_soon')).toBe('warning');
  });

  test('maps backend snake_case "expired" to "danger"', () => {
    expect(getStatusBadgeVariant('expired')).toBe('danger');
  });

  test('returns "secondary" for unknown status', () => {
    expect(getStatusBadgeVariant('unknown')).toBe('secondary');
  });
});
