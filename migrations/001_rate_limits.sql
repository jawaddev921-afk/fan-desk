-- Rate limits and cooldowns live in the database, not in one process's memory (ADR-0004: several serverless instances).
-- One row per key: how many hits in the current window, and when the window ends.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at BIGINT NOT NULL
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
