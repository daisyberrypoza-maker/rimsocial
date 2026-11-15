-- Adds what the current code needs but no migration created yet. Run once, after a backup.
-- Check first: if a column already exists, skip its ALTER (MySQL reports "Duplicate column").

-- Paid promotion: a boosted post stops being an ad when promotedUntil passes
ALTER TABLE posts
  ADD COLUMN promotedUntil DATETIME NULL;

-- Group chat picture
ALTER TABLE group_conversations
  ADD COLUMN avatarUrl VARCHAR(512) NULL;

-- Per-chat preferences: mute, hide, and mark as unread
CREATE TABLE IF NOT EXISTS chat_preferences (
  id CHAR(36) NOT NULL,
  userId CHAR(36) NOT NULL,
  peerId CHAR(36) NULL,
  groupId CHAR(36) NULL,
  muted TINYINT(1) NOT NULL DEFAULT 0,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  markedUnread TINYINT(1) NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY chat_preferences_user_peer (userId, peerId),
  UNIQUE KEY chat_preferences_user_group (userId, groupId),
  KEY chat_preferences_user_muted (userId, muted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Posts a person saved (Saved tab on their profile)
CREATE TABLE IF NOT EXISTS saved_posts (
  userId CHAR(36) NOT NULL,
  postId CHAR(36) NOT NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (userId, postId),
  KEY saved_posts_user_created (userId, createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
