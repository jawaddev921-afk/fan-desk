-- "Request from Creator": a link the creator opens to fill in her own bio. Only the token's hash is stored; it works for 7 days.
CREATE TABLE creator_requests (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
ALTER TABLE creator_requests ENABLE ROW LEVEL SECURITY;
