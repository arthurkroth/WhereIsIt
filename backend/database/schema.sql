-- =============================================================================
-- WhereIsIt? — Complete Database Setup
-- Author: Arthur Kroth - x22166971
-- Compatible with MySQL 8.0+.

-- =============================================================================

CREATE DATABASE IF NOT EXISTS whereisit_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE whereisit_db;

-- =============================================================================
-- TABLE: users
-- Core user accounts table.
-- Stores authentication credentials, MFA state, email verification state,
-- and account status. Sensitive fields (password, MFA secret) are never
-- stored in plain text.
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id                           INT           AUTO_INCREMENT PRIMARY KEY,
  email                        VARCHAR(255)  NOT NULL UNIQUE,
  first_name                   VARCHAR(100)  NOT NULL,
  last_name                    VARCHAR(100)  NOT NULL,
  password_hash                VARCHAR(255)  NOT NULL,
  role                         ENUM('FREE', 'PREMIUM', 'ADMIN') NOT NULL DEFAULT 'FREE',
  status                       ENUM('active', 'suspended') NOT NULL DEFAULT 'active',

  -- MFA (TOTP-based two-factor authentication)
  mfa_enabled                  BOOLEAN       NOT NULL DEFAULT FALSE,
  mfa_secret                   VARCHAR(255)  DEFAULT NULL,

  -- Password reset (token stored as SHA-256 hash, never plain text)
  password_reset_token         VARCHAR(64)   DEFAULT NULL,
  password_reset_expires       DATETIME      DEFAULT NULL,

  -- Email verification (token stored as SHA-256 hash, never plain text)
  email_verified               BOOLEAN       NOT NULL DEFAULT FALSE,
  email_verification_token     VARCHAR(64)   DEFAULT NULL,
  email_verification_expires   DATETIME      DEFAULT NULL,

  -- Premium subscription management
  premium_expires_at           TIMESTAMP     DEFAULT NULL,  -- NULL = no expiry set or not premium
  premium_permanent            BOOLEAN       NOT NULL DEFAULT FALSE, -- TRUE = never expires

  created_at                   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  -- No separate INDEX on email: the UNIQUE constraint above already creates one.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- TABLE: receipts
-- Stores receipt header information per user.
-- Sensitive fields (store name, notes) are AES-256-GCM encrypted before storage.
-- Tags are stored as a plain JSON array (non-sensitive category labels).
-- =============================================================================
CREATE TABLE IF NOT EXISTS receipts (
  id               INT             AUTO_INCREMENT PRIMARY KEY,
  user_id          INT             NOT NULL,
  file_path        VARCHAR(255)    DEFAULT NULL,
  store_name_enc   TEXT            NOT NULL,
  purchase_date    DATE            NOT NULL,
  total_price      DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
  warranty_months  INT             NOT NULL DEFAULT 12,
  ocr_confidence   VARCHAR(20)     DEFAULT NULL,
  notes_enc        TEXT            DEFAULT NULL,
  tags             VARCHAR(500)    NOT NULL DEFAULT '[]',
  created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_receipts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_user_id (user_id),
  INDEX idx_purchase_date (purchase_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- TABLE: receipt_items
-- Stores individual line items belonging to a receipt.
-- Each receipt can have one or more items.
-- Product descriptions are AES-256-GCM encrypted before storage.
-- Rows are automatically deleted when the parent receipt is deleted (CASCADE).
-- =============================================================================
CREATE TABLE IF NOT EXISTS receipt_items (
  id                INT             AUTO_INCREMENT PRIMARY KEY,
  receipt_id        INT             NOT NULL,
  product_desc_enc  TEXT            NOT NULL,
  price             DECIMAL(10, 2)  NOT NULL DEFAULT 0.00,
  warranty_months   INT             NOT NULL DEFAULT 12,
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_items_receipt
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,

  INDEX idx_receipt_id (receipt_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- TABLE: mfa_recovery_codes
-- Stores hashed MFA recovery codes for users who have enabled MFA.
-- Each user gets 8 codes when MFA is set up.
-- Codes are stored as SHA-256 hashes - never in plain text.
-- Each code can only be used once (used flag).
-- All codes are deleted when MFA is disabled.
-- Rows are automatically deleted when the user account is deleted (CASCADE).
-- =============================================================================
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  code_hash   VARCHAR(64)  NOT NULL,
  used        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_recovery_codes_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- TABLE: premium_settings
-- Per-user warranty alert preferences for Premium accounts.
-- =============================================================================
CREATE TABLE IF NOT EXISTS premium_settings (
  id                    INT       AUTO_INCREMENT PRIMARY KEY,
  user_id               INT       NOT NULL UNIQUE,
  alerts_enabled        BOOLEAN   NOT NULL DEFAULT TRUE,
  alert_timeframe_days  INT       NOT NULL DEFAULT 30,
  alert_frequency       ENUM('daily', 'weekly', 'immediate') NOT NULL DEFAULT 'daily',
  last_alert_sent       TIMESTAMP DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_premium_settings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  -- No separate INDEX on user_id: the UNIQUE constraint above already creates one.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- TABLE: support_tickets
-- User-submitted support requests, with an admin response and an optional
-- follow-up user reply. responded_by is the admin who answered the ticket.
-- =============================================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id                INT           AUTO_INCREMENT PRIMARY KEY,
  user_id           INT           NOT NULL,
  subject           VARCHAR(200)  NOT NULL,
  message           TEXT          NOT NULL,
  status            ENUM('open', 'in_progress', 'resolved') NOT NULL DEFAULT 'open',
  priority          ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  admin_response    TEXT          DEFAULT NULL,
  responded_by      INT           DEFAULT NULL,
  user_reply        TEXT          DEFAULT NULL,
  user_replied_at   TIMESTAMP     DEFAULT NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_tickets_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tickets_admin
    FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- TABLE: report_schedule
-- Single-row configuration table (id is always 1) controlling the scheduled
-- admin report generator.
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_schedule (
  id          INT       AUTO_INCREMENT PRIMARY KEY,
  enabled     BOOLEAN   NOT NULL DEFAULT FALSE,
  frequency   ENUM('daily', 'weekly', 'monthly') NOT NULL DEFAULT 'weekly',
  last_run    TIMESTAMP DEFAULT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO report_schedule (id, enabled, frequency) VALUES (1, FALSE, 'weekly')
  ON DUPLICATE KEY UPDATE id = id;


-- =============================================================================
-- TABLE: audit_logs
-- Records all significant user and system actions for security accountability.
-- user_id is SET NULL on user deletion so logs are preserved after account removal.
-- ip_address supports both IPv4 and IPv6 (45 chars covers full IPv6 notation).
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  user_id     INT           DEFAULT NULL,
  action      VARCHAR(100)  NOT NULL,
  details     TEXT          DEFAULT NULL,
  ip_address  VARCHAR(45)   DEFAULT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_audit_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at),
  INDEX idx_action_created_at (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- POST-DEPLOY: Promote an already-registered user to PREMIUM or ADMIN.
-- Run these manually, after the target user has signed up through the app.
-- =============================================================================

-- UPDATE users SET role = 'ADMIN'   WHERE email = 'admin@whereisit.ie';
-- UPDATE users SET role = 'PREMIUM' WHERE email = 'premium@whereisit.ie';


-- =============================================================================
-- VERIFICATION: Run these queries to confirm all tables were created correctly.
-- =============================================================================

-- SHOW TABLES;
-- DESCRIBE users;
-- DESCRIBE receipts;
-- DESCRIBE receipt_items;
-- DESCRIBE mfa_recovery_codes;
-- DESCRIBE premium_settings;
-- DESCRIBE support_tickets;
-- DESCRIBE report_schedule;
-- DESCRIBE audit_logs;
