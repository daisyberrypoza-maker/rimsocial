-- Story likes (double-tap or heart in the story viewer). Additive; one row per viewer per story.
CREATE TABLE IF NOT EXISTS story_likes (
  postId CHAR(36) NOT NULL,
  userId CHAR(36) NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (postId, userId),
  INDEX story_likes_user_idx (userId)
);
