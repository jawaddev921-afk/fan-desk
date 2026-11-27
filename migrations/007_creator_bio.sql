-- The creator's Bio (identity and voice the assistant writes in). One JSON document per account; the form definition lives in code (features/creator/schema.ts).
CREATE TABLE creator_bio (
  account_id TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  bio JSONB NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL
);
ALTER TABLE creator_bio ENABLE ROW LEVEL SECURITY;
