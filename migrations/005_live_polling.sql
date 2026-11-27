-- Seeing new messages (and their pictures) without waiting for a button (ADR-0004).
-- messages.media_pending: the webhook told us the message has media but its list is not stored yet; the next poll fetches it.
-- accounts.poll_at: when this account's inbox is next looked at for changes (0 = as soon as possible, e.g. right after a webhook).
ALTER TABLE messages ADD COLUMN media_pending BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN poll_at BIGINT;
