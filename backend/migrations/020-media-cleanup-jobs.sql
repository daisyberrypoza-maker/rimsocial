-- Durable retry queue for Cloudinary asset deletion.
-- Apply before deploying code that uses MediaCleanupJob when DB_SYNC=false.
CREATE TABLE IF NOT EXISTS media_cleanup_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  publicId VARCHAR(255) NOT NULL,
  resourceType ENUM('image','video','raw') NOT NULL DEFAULT 'image',
  reason VARCHAR(100) NOT NULL DEFAULT 'cleanup',
  status ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  nextAttemptAt DATETIME NOT NULL,
  lastError VARCHAR(1000) NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  UNIQUE KEY uq_media_cleanup_asset_type (publicId, resourceType),
  KEY idx_media_cleanup_due (status, nextAttemptAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
