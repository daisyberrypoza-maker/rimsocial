-- Public creator LIVE broadcast sessions. Apply before deploying with DB_SYNC=false.
CREATE TABLE IF NOT EXISTS live_broadcasts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  hostId CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL DEFAULT '',
  status ENUM('live','ended') NOT NULL DEFAULT 'live',
  endedAt DATETIME NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX idx_live_broadcasts_status_created (status, createdAt),
  INDEX idx_live_broadcasts_host_status (hostId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
