-- One row per person who has viewed a post, so profiles can show how many people viewed it
CREATE TABLE IF NOT EXISTS post_viewers (
  postId CHAR(36) NOT NULL,
  userId CHAR(36) NOT NULL,
  createdAt DATETIME NOT NULL,
  PRIMARY KEY (postId, userId),
  KEY post_viewers_user (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
