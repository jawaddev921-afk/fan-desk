-- "Advanced Settings" drawer: message delay, follow-up, bump timing, active hours (see features/creator/schema.ts).
ALTER TABLE creator_bio ADD COLUMN advanced JSONB NOT NULL DEFAULT '{}';
