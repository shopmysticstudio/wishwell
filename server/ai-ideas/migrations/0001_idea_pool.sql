-- Wishwell idea pool (D1). Anonymous: idea text and counts only.
-- No names, notes, IP addresses, device ids or license keys are ever stored here.

-- One row per AI idea, keyed by its normalized title.
CREATE TABLE IF NOT EXISTS ideas (
  key        TEXT PRIMARY KEY,      -- lowercase title, letters and digits only
  title      TEXT NOT NULL,
  category   TEXT NOT NULL,
  why        TEXT NOT NULL DEFAULT '',
  search     TEXT NOT NULL DEFAULT '',
  lo_sum     INTEGER NOT NULL DEFAULT 0,   -- summed low prices, divide by shown
  hi_sum     INTEGER NOT NULL DEFAULT 0,   -- summed high prices, divide by shown
  shown      INTEGER NOT NULL DEFAULT 0,   -- times the AI suggested it
  kept       INTEGER NOT NULL DEFAULT 0,   -- times someone circled it
  top        INTEGER NOT NULL DEFAULT 0,   -- times it was ranked in someone's top 3
  cut        INTEGER NOT NULL DEFAULT 0,   -- times someone cut it
  first_day  TEXT NOT NULL,
  last_day   TEXT NOT NULL
);

-- Which taste tags produced each idea: "int:Tech", "budget:75", "style:Cozy", "for:me".
CREATE TABLE IF NOT EXISTS idea_tags (
  key  TEXT NOT NULL,
  tag  TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, tag)
);

CREATE INDEX IF NOT EXISTS ideas_kept ON ideas (kept DESC);
