-- Comment replies (migration 044): a reply points at its top-level comment.
ALTER TABLE post_comments
  ADD COLUMN parentId CHAR(36) NULL,
  ADD INDEX post_comments_parent (parentId);
