-- Message Library (like SuperCreator's): folders of saved messages, with {name} personalisation settings per user.
-- account_ids is a JSON list of the creator accounts a message is for (empty = all). media holds Vault items later.
CREATE TABLE library_folders (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE TABLE library_messages (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES library_folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  ai_pricing INTEGER NOT NULL DEFAULT 0,
  media JSONB NOT NULL DEFAULT '[]',
  account_ids JSONB NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL
);
CREATE INDEX library_messages_user ON library_messages(user_id, folder_id);
CREATE TABLE library_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fallback_name TEXT NOT NULL DEFAULT 'babe',
  capitalize INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE library_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_settings ENABLE ROW LEVEL SECURITY;
