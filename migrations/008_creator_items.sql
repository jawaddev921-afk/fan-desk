-- Creator tab beyond the bio: Train answers and the on/off flags live next to the bio; products, bump messages, scripts and
-- live updates are one table of items (kind + a JSON document), because they share the same list/edit/delete/live behaviour.
ALTER TABLE creator_bio ADD COLUMN train JSONB NOT NULL DEFAULT '{}';
ALTER TABLE creator_bio ADD COLUMN flags JSONB NOT NULL DEFAULT '{"enabled": true, "bump": false}';
CREATE TABLE creator_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  live INTEGER NOT NULL DEFAULT 1,
  data JSONB NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX creator_items_account ON creator_items(account_id, kind, id);
ALTER TABLE creator_items ENABLE ROW LEVEL SECURITY;
