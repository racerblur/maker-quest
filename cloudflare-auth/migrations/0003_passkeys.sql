CREATE TABLE IF NOT EXISTS passkey (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  publicKey TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL UNIQUE,
  counter INTEGER NOT NULL,
  deviceType TEXT NOT NULL,
  backedUp INTEGER NOT NULL,
  transports TEXT,
  createdAt INTEGER,
  aaguid TEXT
);
CREATE INDEX IF NOT EXISTS passkey_userId_idx ON passkey(userId);

CREATE TABLE IF NOT EXISTS passkey_recovery (
  code_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS passkey_enrollment (
  id TEXT PRIMARY KEY NOT NULL,
  challenge TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  recovery_hash TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS passkey_enrollment_expiry_idx ON passkey_enrollment(expires_at);
