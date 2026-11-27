-- "Choose who messages" and "Exclude fans from Bump": the rules for which fans the writer may handle (see features/creator/schema.ts).
ALTER TABLE creator_bio ADD COLUMN targeting JSONB NOT NULL DEFAULT '{}';
