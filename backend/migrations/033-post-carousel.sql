-- Carousel posts: a post can hold several photos and/or videos. mediaItems is null for single-media posts. Additive.
ALTER TABLE posts
  ADD COLUMN mediaItems JSON NULL;
