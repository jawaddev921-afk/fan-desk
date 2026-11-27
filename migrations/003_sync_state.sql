-- Background sync (ADR-0004): where each account's first import stands, so it can stop and continue (a serverless step ends after a few minutes).
-- sync_status: idle (nothing running) | running | done | failed. A new account starts as running.
ALTER TABLE accounts ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE accounts ADD COLUMN sync_cursor TEXT;                              -- the inbox cursor to continue from
ALTER TABLE accounts ADD COLUMN sync_chats INTEGER NOT NULL DEFAULT 0;         -- conversations read in this run
ALTER TABLE accounts ADD COLUMN sync_messages INTEGER NOT NULL DEFAULT 0;      -- messages stored in this run
ALTER TABLE accounts ADD COLUMN sync_old_pages INTEGER NOT NULL DEFAULT 0;     -- consecutive inbox pages with nothing inside the window
ALTER TABLE accounts ADD COLUMN sync_started_at BIGINT;
ALTER TABLE accounts ADD COLUMN sync_updated_at BIGINT;
ALTER TABLE accounts ADD COLUMN sync_lease_until BIGINT;                       -- a worker holds the sync until then (no two workers on one account)
ALTER TABLE accounts ADD COLUMN sync_error TEXT;
