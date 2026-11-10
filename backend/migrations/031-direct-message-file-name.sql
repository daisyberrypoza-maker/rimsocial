-- Original file name for chat attachments (documents, audio and other files). Additive.
ALTER TABLE direct_messages ADD COLUMN mediaName VARCHAR(255) NULL;
