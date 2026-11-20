-- Reports against a profile (migration 038). Run once, after a backup.
-- Mirrors post_reports: one pending report per reporter and reported user.
CREATE TABLE IF NOT EXISTS user_reports (
  id CHAR(36) NOT NULL PRIMARY KEY,
  reportedUserId CHAR(36) NOT NULL,
  reporterId CHAR(36) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('pending', 'reviewed', 'dismissed') NOT NULL DEFAULT 'pending',
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX user_reports_reported_created (reportedUserId, createdAt),
  INDEX user_reports_reporter_created (reporterId, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
