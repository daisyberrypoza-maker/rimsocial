-- Comment likes (migration 045): a like count on each comment and one row per viewer like.
ALTER TABLE post_comments
  ADD COLUMN likeCount INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS comment_likes (
  commentId CHAR(36) NOT NULL,
  userId CHAR(36) NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (commentId, userId),
  INDEX comment_likes_user_comment (userId, commentId)
);
