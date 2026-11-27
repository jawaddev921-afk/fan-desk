-- Sign-up with a name and a confirmed email (ADR-0004). The account is created only after the person opens the link we email.
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN email_verified_at BIGINT;
UPDATE users SET email_verified_at = created_at; -- accounts made before this existed

-- A sign-up waiting for its email to be confirmed. Only the hash of the emailed token is stored; one row per email (a new request replaces the old).
CREATE TABLE signup_requests (
  token_hash TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  terms_accepted_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;
