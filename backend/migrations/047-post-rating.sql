-- Migration 047: nullable 0–5 post rating used by Rimlight indicators.
-- Safe for existing content; unrated posts remain NULL.
ALTER TABLE posts ADD COLUMN rating DECIMAL(3,2) NULL;
