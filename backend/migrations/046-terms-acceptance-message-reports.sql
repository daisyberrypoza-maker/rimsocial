ALTER TABLE users ADD COLUMN termsAcceptedAt DATETIME NULL;
CREATE TABLE IF NOT EXISTS message_reports (
 id CHAR(36) NOT NULL PRIMARY KEY, messageId CHAR(36) NOT NULL, reporterId CHAR(36) NOT NULL, reportedUserId CHAR(36) NOT NULL,
 reason VARCHAR(500) NOT NULL, status ENUM('pending','reviewed','dismissed') NOT NULL DEFAULT 'pending',
 createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY message_reports_message_reporter (messageId, reporterId), INDEX message_reports_reported_user_created (reportedUserId, createdAt)
);
