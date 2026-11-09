-- Pronouns and gender shown on Edit profile. Additive; existing users start empty.
ALTER TABLE users ADD COLUMN pronouns VARCHAR(40) NULL, ADD COLUMN gender VARCHAR(40) NULL;
