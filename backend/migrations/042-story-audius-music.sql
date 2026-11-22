-- Story music from Audius and per-story mix settings (migration 042).
-- Existing stories keep musicSource NULL and their stored musicUrl.
ALTER TABLE posts
  ADD COLUMN musicSource VARCHAR(10) NULL,
  ADD COLUMN audiusTrackId VARCHAR(20) NULL,
  ADD COLUMN artistName VARCHAR(80) NULL,
  ADD COLUMN artworkUrl VARCHAR(512) NULL,
  ADD COLUMN musicOffsetSec FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN origVolume FLOAT NOT NULL DEFAULT 0.3,
  ADD COLUMN musicVolume FLOAT NOT NULL DEFAULT 0.8,
  ADD COLUMN musicMixable TINYINT(1) NOT NULL DEFAULT 0;
