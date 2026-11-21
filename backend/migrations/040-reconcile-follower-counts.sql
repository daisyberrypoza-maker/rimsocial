-- Recalculate the stored followerCount from the follows table (migration 040).
-- Lists (suggestions, search, Explore, creators) read this column. Safe to run more than once.
UPDATE users u
SET u.followerCount = (SELECT COUNT(*) FROM follows f WHERE f.followeeId = u.id);
