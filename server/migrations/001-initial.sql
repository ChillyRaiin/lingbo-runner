CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, external_id TEXT UNIQUE, consent INTEGER NOT NULL DEFAULT 0, consent_version TEXT, consent_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, encrypted_session_key TEXT);
CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, provider TEXT, external_id TEXT, payload TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS activity_external ON activities(user_id, provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activity_dates ON activities(user_id, date);
CREATE TABLE IF NOT EXISTS checkins (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id, date));
CREATE TABLE IF NOT EXISTS steps (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, step INTEGER NOT NULL, PRIMARY KEY(user_id, date));
