CREATE TABLE product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_hash TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK(event_name IN (
    'visited',
    'prefecture_selected',
    'searched',
    'no_result',
    'type_changed',
    'saved',
    'copied',
    'official_opened',
    'returned'
  )),
  is_qa INTEGER NOT NULL DEFAULT 0 CHECK (is_qa IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE INDEX product_events_created_at_idx ON product_events(created_at);
CREATE INDEX product_events_session_idx ON product_events(session_hash, created_at);
