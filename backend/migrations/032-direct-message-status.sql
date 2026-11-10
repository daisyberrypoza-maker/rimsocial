-- Message status and actions: delivered time, edits, delete for everyone, delete for me, replies and forwards. Additive.
ALTER TABLE direct_messages
  ADD COLUMN deliveredAt DATETIME NULL,
  ADD COLUMN editedAt DATETIME NULL,
  ADD COLUMN deletedForEveryone TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN hiddenFor TEXT NULL,
  ADD COLUMN replyToId CHAR(36) NULL,
  ADD COLUMN forwarded TINYINT(1) NOT NULL DEFAULT 0;
