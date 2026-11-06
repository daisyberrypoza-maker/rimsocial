-- Creator earnings per source (gift, ad_share, promotion, premium) shown in Creator Studio.
-- Additive only: creates the table if it is missing and never alters or deletes existing rows.
-- Apply before deploying code that records gift earnings when DB_SYNC=false.
CREATE TABLE IF NOT EXISTS content_earnings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  creatorId CHAR(36) NOT NULL,
  postId CHAR(36) NULL,
  source ENUM('gift','ad_share','promotion','premium') NOT NULL,
  amountMinor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status ENUM('pending','released','reversed') NOT NULL DEFAULT 'pending',
  reference VARCHAR(128) NOT NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  UNIQUE KEY content_earnings_reference (reference),
  INDEX content_earnings_creator_id_created_at (creatorId, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
