-- Music library: uploaded audio tracks that people can search and listen to. Additive; existing data untouched.
CREATE TABLE IF NOT EXISTS audio_tracks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  uploadedById CHAR(36) NOT NULL,
  title VARCHAR(80) NOT NULL,
  artist VARCHAR(80) NOT NULL,
  mediaUrl VARCHAR(512) NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_audio_tracks_title (title),
  INDEX idx_audio_tracks_artist (artist)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
