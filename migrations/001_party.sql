-- Server-only tables: no browser/anon access. Run migrations as the database owner.
CREATE TABLE events (
  id text PRIMARY KEY,
  name text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('registration', 'voting', 'closed')),
  revealed boolean NOT NULL DEFAULT false,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  next_number integer NOT NULL CHECK (next_number > 0)
);
CREATE TABLE entries (
  event_id text NOT NULL REFERENCES events(id),
  id text NOT NULL,
  number integer NOT NULL CHECK (number > 0),
  title text NOT NULL,
  names text NOT NULL,
  type text NOT NULL CHECK (type IN ('individual', 'couple')),
  approved boolean NOT NULL,
  hidden boolean NOT NULL,
  icon text NOT NULL,
  photo text,
  member_one text,
  member_two text,
  member_type text GENERATED ALWAYS AS ('individual'::text) STORED,
  PRIMARY KEY (event_id, id),
  UNIQUE (event_id, number),
  UNIQUE (event_id, id, type),
  FOREIGN KEY (event_id, member_one, member_type) REFERENCES entries(event_id, id, type) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (event_id, member_two, member_type) REFERENCES entries(event_id, id, type) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((type = 'individual' AND member_one IS NULL AND member_two IS NULL) OR
    (type = 'couple' AND member_one IS NOT NULL AND member_two IS NOT NULL AND member_one <> member_two))
);
CREATE TABLE categories (
  event_id text NOT NULL REFERENCES events(id),
  id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('individual', 'couple')),
  position integer NOT NULL,
  PRIMARY KEY (event_id, id),
  UNIQUE (event_id, id, type)
);
CREATE TABLE votes (
  event_id text NOT NULL REFERENCES events(id),
  voter text NOT NULL,
  category text NOT NULL,
  entry text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('individual', 'couple')),
  sequence integer NOT NULL CHECK (sequence > 0),
  PRIMARY KEY (event_id, voter, category),
  FOREIGN KEY (event_id, category, entry_type) REFERENCES categories(event_id, id, type) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (event_id, entry, entry_type) REFERENCES entries(event_id, id, type) DEFERRABLE INITIALLY DEFERRED
);
-- Supabase's public schema must not expose these tables through its Data API.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON events, entries, categories, votes FROM PUBLIC;
