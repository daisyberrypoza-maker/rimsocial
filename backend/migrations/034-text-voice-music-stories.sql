-- Stories with text on a background, a voice note and a music track. Additive; photo and video stories are unchanged.
ALTER TABLE posts
  MODIFY COLUMN kind ENUM('video', 'photo', 'text') NOT NULL,
  MODIFY COLUMN mediaUrl VARCHAR(512) NULL,
  ADD COLUMN storyText TEXT NULL,
  ADD COLUMN storyBackground VARCHAR(40) NULL,
  ADD COLUMN voiceUrl VARCHAR(512) NULL,
  ADD COLUMN musicUrl VARCHAR(512) NULL,
  ADD COLUMN musicTitle VARCHAR(120) NULL;
