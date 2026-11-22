-- Duplicate sound protection (migration 043): each uploaded file has a SHA-256 hash.
-- A second upload of the same file returns the existing sound.
ALTER TABLE audio_tracks
  ADD COLUMN contentHash CHAR(64) NULL,
  ADD INDEX audio_tracks_content_hash (contentHash);
