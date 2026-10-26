CREATE TABLE IF NOT EXISTS intake_limits (
  bucket TEXT PRIMARY KEY,
  period INTEGER NOT NULL,
  requests INTEGER NOT NULL CHECK(requests >= 0)
);
