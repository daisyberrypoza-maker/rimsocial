-- End-to-end encryption for one-to-one chats: each person's public key (the private key stays on their device)
CREATE TABLE IF NOT EXISTS user_keys (
  userId CHAR(36) NOT NULL PRIMARY KEY,
  publicKey TEXT NOT NULL,
  updatedAt DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
