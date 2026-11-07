-- Profile details: bio, website and city. Additive; existing users start empty.
ALTER TABLE users ADD COLUMN bio VARCHAR(150) NULL, ADD COLUMN website VARCHAR(200) NULL, ADD COLUMN city VARCHAR(80) NULL;
