/**
 * File: TagSelector.js
 * Author: Arthur Kroth - x22166971
 * WhereIsIt Project
 */

import React from 'react';

/**
 * Predefined tag options for categorising receipts.
 * Used in ReceiptUpload, ReceiptManual, and ReceiptDetail.
 */
export const PREDEFINED_TAGS = [
  'Electronics', 'Appliances', 'Furniture', 'Clothing',
  'Food & Drink', 'Tools', 'Sports', 'Books',
  'Toys', 'Automotive', 'Health', 'Other'
];

/**
 * TagSelector Component
 * Displays a row of clickable tag buttons that toggle on/off.
 * Selected tags are highlighted in primary colour.
 *
 * @param {string[]} selectedTags - Currently selected tags
 * @param {function} onChange - Called with the new tags array when selection changes
 * @param {boolean} disabled - Disables all interaction when true
 */
function TagSelector({ selectedTags = [], onChange, disabled = false }) {
  /**
   * Toggles a tag in/out of the selected array.
   * @param {string} tag - Tag to toggle
   */
  const toggleTag = (tag) => {
    if (disabled) return;
    const updated = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    onChange(updated);
  };

  return (
    <div className="d-flex flex-wrap gap-2">
      {PREDEFINED_TAGS.map(tag => (
        <button
          key={tag}
          type="button"
          onClick={() => toggleTag(tag)}
          disabled={disabled}
          style={{
            padding: '4px 12px',
            borderRadius: '20px',
            border: '1px solid',
            cursor: disabled ? 'default' : 'pointer',
            fontSize: '0.85rem',
            transition: 'all 0.15s ease',
            backgroundColor: selectedTags.includes(tag) ? '#0d6efd' : 'transparent',
            borderColor: selectedTags.includes(tag) ? '#0d6efd' : '#adb5bd',
            color: selectedTags.includes(tag) ? '#ffffff' : '#6c757d'
          }}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

export default TagSelector;