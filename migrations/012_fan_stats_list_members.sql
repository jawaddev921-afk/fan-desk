-- Real fan data from the provider: when a fan subscribed (for the new/old fan rules) and when their spend was last refreshed,
-- and which fans are on a fan list (a list copied from OnlyFans is filled by the worker, a page at a time).
ALTER TABLE fans ADD COLUMN subscribed_at BIGINT;
ALTER TABLE fans ADD COLUMN stats_at BIGINT;
CREATE TABLE creator_list_members (
  list_id INTEGER NOT NULL REFERENCES creator_items(id) ON DELETE CASCADE,
  fan_id TEXT NOT NULL,
  PRIMARY KEY (list_id, fan_id)
);
CREATE INDEX creator_list_members_fan ON creator_list_members(fan_id);
ALTER TABLE creator_list_members ENABLE ROW LEVEL SECURITY;
