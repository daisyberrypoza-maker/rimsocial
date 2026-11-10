-- Photos and videos in chat, and RimSocial post links shown as preview cards. Additive; existing messages stay text-only.
ALTER TABLE direct_messages
  ADD COLUMN mediaUrl VARCHAR(512) NULL,
  ADD COLUMN mediaKind VARCHAR(12) NULL,
  ADD COLUMN postId CHAR(36) NULL,
  MODIFY COLUMN body VARCHAR(2000) NOT NULL DEFAULT '',
  ADD INDEX direct_messages_post_id (postId);
