-- The schema when Fan Desk moved from SQLite to Postgres (ADR-0004). Plain SQL, each file runs once, in order; new changes go
-- into 001_..., 002_... and a file that already ran is never edited.
--
-- Timestamps are BIGINT milliseconds since the epoch (what the code already uses). Flags stay 0/1 integers.
-- Row level security is ON for every table with no policy: on Supabase this closes the public REST API for them, while the
-- server's own connection (the table owner) is not affected.

-- ---- auth
CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  pw_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  terms_accepted_at BIGINT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

-- ---- accounts
-- One provider key per user. The key and webhook secret are stored encrypted (AES-256-GCM).
CREATE TABLE connections (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_enc TEXT NOT NULL,
  key_last4 TEXT NOT NULL,
  team_name TEXT,
  team_slug TEXT,
  credits_balance INTEGER,
  webhook_token TEXT UNIQUE NOT NULL,
  webhook_secret_enc TEXT NOT NULL,
  webhook_id TEXT,
  webhook_error TEXT,
  webhook_registered_at BIGINT,
  updated_at BIGINT NOT NULL
);

-- account_id is the provider's id (acct_...). It can belong to exactly one user.
CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT,
  display_name TEXT,
  settings TEXT NOT NULL,
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  send_mode TEXT NOT NULL DEFAULT 'draft',
  note TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX accounts_by_user ON accounts(user_id);

-- ---- inbox
CREATE TABLE events (
  user_id INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  event TEXT NOT NULL,
  received_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE TABLE fans (
  account_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  username TEXT,
  name TEXT,
  total_spend DOUBLE PRECISION NOT NULL DEFAULT 0,
  intent TEXT NOT NULL DEFAULT 'unknown',
  score INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'cold',
  mode TEXT NOT NULL DEFAULT 'assistant',
  handoff_reason TEXT,
  ai_summary TEXT,
  last_paid_at BIGINT,
  last_message_at BIGINT,
  PRIMARY KEY (account_id, fan_id)
);

CREATE TABLE messages (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  of_id TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX messages_by_fan ON messages(account_id, fan_id, created_at);
CREATE UNIQUE INDEX messages_by_of_id ON messages(account_id, of_id) WHERE of_id IS NOT NULL;

-- ---- assistant
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  of_message_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE reply_jobs (
  account_id TEXT NOT NULL,
  fan_id TEXT NOT NULL,
  run_at BIGINT NOT NULL,
  PRIMARY KEY (account_id, fan_id)
);

CREATE TABLE usage (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id TEXT NOT NULL,
  at BIGINT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL
);
CREATE INDEX usage_by_account ON usage(account_id, at);

-- ---- row level security (see the note at the top)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fans ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
