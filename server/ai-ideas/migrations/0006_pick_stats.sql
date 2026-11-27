-- Daily totals of AI ideas shown, kept, ranked top 3, cut and already had (counts only),
-- to see whether picks get better over time.
CREATE TABLE IF NOT EXISTS pick_stats (
  day   TEXT PRIMARY KEY,   -- YYYY-MM-DD, US Eastern
  shown INTEGER NOT NULL DEFAULT 0,
  kept  INTEGER NOT NULL DEFAULT 0,
  top   INTEGER NOT NULL DEFAULT 0,
  cut   INTEGER NOT NULL DEFAULT 0,
  have  INTEGER NOT NULL DEFAULT 0
);
