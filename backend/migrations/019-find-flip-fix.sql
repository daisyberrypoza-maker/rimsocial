-- RimSocial Find, Flip & Fix marketplace tables.
-- Additive only: does not alter or delete existing users, posts, wallets, or ledger rows.
-- Apply this SQL to the configured database before deploying with NODE_ENV=production and DB_SYNC=false.

CREATE TABLE IF NOT EXISTS business_profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  ownerId CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  country CHAR(2) NOT NULL DEFAULT 'NG',
  city VARCHAR(100) NOT NULL,
  website VARCHAR(512) NULL,
  verificationStatus ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX idx_business_profiles_owner_created (ownerId, createdAt),
  INDEX idx_business_profiles_location_category (country, city, category),
  INDEX idx_business_profiles_verification (verificationStatus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_opportunities (
  id CHAR(36) NOT NULL PRIMARY KEY,
  ownerId CHAR(36) NOT NULL,
  businessId CHAR(36) NULL,
  lane ENUM('find','flip','fix') NOT NULL,
  title VARCHAR(140) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  country CHAR(2) NOT NULL DEFAULT 'NG',
  city VARCHAR(100) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  askingPriceMinor BIGINT NULL,
  estimatedCostMinor BIGINT NULL,
  targetPriceMinor BIGINT NULL,
  budgetMinor BIGINT NULL,
  actualSalePriceMinor BIGINT NULL,
  actualCostMinor BIGINT NULL,
  realizedProfitMinor BIGINT NULL,
  financialsUpdatedAt DATETIME NULL,
  evidenceUrl VARCHAR(1024) NULL,
  status ENUM('draft','published','paused','in_progress','review','completed','closed','rejected') NOT NULL DEFAULT 'published',
  reviewStatus ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  assignedUserId CHAR(36) NULL,
  reviewedBy VARCHAR(190) NULL,
  reviewedAt DATETIME NULL,
  reviewNote VARCHAR(500) NULL,
  completedAt DATETIME NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX idx_business_opportunities_discovery (lane, reviewStatus, status, createdAt),
  INDEX idx_business_opportunities_owner_status (ownerId, status),
  INDEX idx_business_opportunities_location (country, city, category),
  INDEX idx_business_opportunities_assignee (assignedUserId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_offers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  opportunityId CHAR(36) NOT NULL,
  senderId CHAR(36) NOT NULL,
  recipientId CHAR(36) NOT NULL,
  amountMinor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  message VARCHAR(1000) NOT NULL DEFAULT '',
  status ENUM('pending','accepted','rejected','withdrawn','completed','disputed') NOT NULL DEFAULT 'pending',
  idempotencyKey VARCHAR(100) NULL UNIQUE,
  senderCompletedAt DATETIME NULL,
  recipientCompletedAt DATETIME NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX idx_business_offers_opportunity_status (opportunityId, status, createdAt),
  INDEX idx_business_offers_sender_status (senderId, status),
  INDEX idx_business_offers_recipient_status (recipientId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_work_updates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  opportunityId CHAR(36) NOT NULL,
  authorId CHAR(36) NOT NULL,
  kind ENUM('progress','blocker','completion') NOT NULL DEFAULT 'progress',
  body VARCHAR(2000) NOT NULL,
  evidenceUrl VARCHAR(1024) NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX idx_business_work_updates_opportunity (opportunityId, createdAt),
  INDEX idx_business_work_updates_author (authorId, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_financial_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  opportunityId CHAR(36) NOT NULL,
  authorId CHAR(36) NOT NULL,
  purchasePriceMinor BIGINT NOT NULL,
  actualSalePriceMinor BIGINT NOT NULL,
  actualCostMinor BIGINT NOT NULL,
  realizedProfitMinor BIGINT NOT NULL,
  note VARCHAR(1000) NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX idx_business_financial_records_opportunity (opportunityId, createdAt),
  INDEX idx_business_financial_records_author (authorId, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
