-- The Claude API key a user pastes in the Jazz tab (stored encrypted, like the Fans API key). When it exists, every AI call for that user's accounts uses it.
CREATE TABLE ai_keys (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'claude',
  key_enc TEXT NOT NULL,
  key_last4 TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
ALTER TABLE ai_keys ENABLE ROW LEVEL SECURITY;
