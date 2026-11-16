-- Durable, per-viewer recommendation exposure history for Discover and Rimlight/Explore.
-- Additive only: no existing posts, users, or feed data are changed.
CREATE TABLE IF NOT EXISTS feed_exposures (
  viewerId CHAR(36) NOT NULL,
  postId CHAR(36) NOT NULL,
  surface ENUM('discover', 'explore') NOT NULL,
  impressionCount INT UNSIGNED NOT NULL DEFAULT 1,
  firstSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewerId, postId, surface),
  INDEX idx_feed_exposures_surface_last_seen (surface, lastSeenAt),
  INDEX idx_feed_exposures_post_surface (postId, surface)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
