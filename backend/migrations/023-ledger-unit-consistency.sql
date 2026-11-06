-- Separate coin quantities from fiat minor currency units in the ledger.
-- Historical gift_out deltaMinor values were coin counts in the existing sendGift implementation.
ALTER TABLE ledger_entries
  ADD COLUMN deltaCoins BIGINT NOT NULL DEFAULT 0 AFTER deltaMinor;

UPDATE ledger_entries
SET deltaCoins = ABS(deltaMinor), deltaMinor = 0
WHERE kind = 'gift_out' AND deltaMinor <> 0;
