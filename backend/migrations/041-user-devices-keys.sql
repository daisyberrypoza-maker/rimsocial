-- One public encryption key per device (migration 041). A person's devices each keep their own private key,
-- so every device can read messages. user_keys stays for older app versions.
CREATE TABLE IF NOT EXISTS user_devices (
  userId CHAR(36) NOT NULL,
  deviceId VARCHAR(64) NOT NULL,
  publicKey TEXT NOT NULL,
  updatedAt DATETIME NOT NULL,
  PRIMARY KEY (userId, deviceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
