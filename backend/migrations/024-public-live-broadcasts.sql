-- Public LIVE sessions and audience chat. Additive migration; preserves existing data.
CREATE TABLE IF NOT EXISTS live_broadcasts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  hostId CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  status ENUM('live','ended') NOT NULL DEFAULT 'live',
  viewerCount INT NOT NULL DEFAULT 0,
  startedAt DATETIME NOT NULL,
  endedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_live_broadcast_status_started (status, startedAt),
  INDEX idx_live_broadcast_host_status (hostId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS live_broadcast_messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  broadcastId CHAR(36) NOT NULL,
  userId CHAR(36) NOT NULL,
  body VARCHAR(500) NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_live_broadcast_chat_time (broadcastId, createdAt),
  INDEX idx_live_broadcast_chat_user (userId, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
