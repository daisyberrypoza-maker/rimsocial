-- Whether a video post loops in feeds (migration 039). Existing posts keep looping.
ALTER TABLE posts
  ADD COLUMN loopVideo TINYINT(1) NOT NULL DEFAULT 1;
