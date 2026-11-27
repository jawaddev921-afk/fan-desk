-- The creator's own profile photo address from the provider, shown on the Creator tab (served through our own proxy, like fan photos).
ALTER TABLE accounts ADD COLUMN avatar_url TEXT;
