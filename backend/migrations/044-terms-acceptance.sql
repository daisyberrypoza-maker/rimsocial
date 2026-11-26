-- Explicit acceptance of the current Terms of Service during account registration.
-- Existing accounts remain valid; new registrations must send termsAccepted=true.
ALTER TABLE users
  ADD COLUMN termsAcceptedAt DATETIME NULL;
