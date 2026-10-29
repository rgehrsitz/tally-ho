-- Provision by trusted database administration, never by a guest or Auth metadata.
-- No FK to auth.users: the local PostgreSQL demo intentionally has no Auth schema.
CREATE TABLE event_hosts (
  event_id text NOT NULL REFERENCES events(id),
  user_id uuid NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
ALTER TABLE event_hosts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON event_hosts FROM PUBLIC;
