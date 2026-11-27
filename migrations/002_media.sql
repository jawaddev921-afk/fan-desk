-- Fan photos and message media (ADR-0004). Only links are stored, never the files.
-- messages.media: [{ id, type: photo|video|audio|gif, locked, price, url }]; url is set only for media the account can view.
ALTER TABLE fans ADD COLUMN avatar_url TEXT;
ALTER TABLE messages ADD COLUMN media JSONB;
