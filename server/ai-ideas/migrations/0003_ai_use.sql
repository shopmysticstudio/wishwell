-- Free AI round counts (the Worker also creates this table on first use).
-- k is "dev:<tier>:<sha256 of device id>" or "net:<tier>:<sha256 of IP or IPv6 /64>": hashes only,
-- never a raw device id or IP address. Rows expire (exp, unix seconds) and then start over.
CREATE TABLE IF NOT EXISTS ai_use (
  k    TEXT PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0,
  exp  INTEGER NOT NULL
);
