-- Shared discount codes (D1). Public by design: only the store, the code, a short "what it's for",
-- an optional end date and vote counts. Nothing about who added or voted is stored here.
CREATE TABLE IF NOT EXISTS codes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  store     TEXT NOT NULL,                 -- one of the app's store ids (amazon, target, ...)
  code      TEXT NOT NULL,                 -- uppercase letters, digits and dashes
  about     TEXT NOT NULL DEFAULT '',      -- e.g. "20% off toys", no links
  expires   TEXT NOT NULL DEFAULT '',      -- YYYY-MM-DD or ''
  added     TEXT NOT NULL,
  worked    INTEGER NOT NULL DEFAULT 0,
  failed    INTEGER NOT NULL DEFAULT 0,
  reported  INTEGER NOT NULL DEFAULT 0,    -- "Report" taps (spam or offensive)
  removed   INTEGER NOT NULL DEFAULT 0,    -- 1 = hidden by hand
  UNIQUE (store, code)
);
-- To remove a code by hand:
--   UPDATE codes SET removed = 1 WHERE store = 'target' AND code = 'SAVE10';
