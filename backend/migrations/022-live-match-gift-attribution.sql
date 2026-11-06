-- Attribute battle gifts to the specific LIVE match they were sent during.
-- Existing gifts remain NULL and are deliberately excluded from LIVE battle scores.
ALTER TABLE gift_transactions
  ADD COLUMN liveMatchId CHAR(36) NULL AFTER postId,
  ADD INDEX gift_transactions_live_match_creator (liveMatchId, creatorId);
