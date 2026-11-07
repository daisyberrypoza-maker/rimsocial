-- Per-follow bell: notify a viewer when a followed creator posts. Additive; existing follows default to off.
ALTER TABLE follows ADD COLUMN notifyPosts TINYINT(1) NOT NULL DEFAULT 0;
