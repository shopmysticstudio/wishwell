-- Anonymous round log, for training a recommender later. One row per round of ideas, one row per idea shown.
-- list_id is a random id the device makes for each quiz; it is not tied to a device id, key, email or address.
-- No names, Details text or internet addresses. has_details only says whether Details was filled in.
CREATE TABLE IF NOT EXISTS rounds (
  list_id TEXT NOT NULL, round INTEGER NOT NULL,
  day TEXT NOT NULL, hour INTEGER NOT NULL,           -- US Eastern
  surface TEXT NOT NULL,                              -- web, beta or app
  source TEXT NOT NULL,                               -- ai, starter or mixed
  for_who TEXT NOT NULL DEFAULT '', age TEXT NOT NULL DEFAULT '', lean TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT '', budget TEXT NOT NULL DEFAULT '',
  ints TEXT NOT NULL DEFAULT '[]',                    -- JSON list of interests picked
  quiz TEXT NOT NULL DEFAULT '[]',                    -- JSON list like ["sat2=1","ears=2"] (0 first choice, 1 second, 2 both)
  has_details INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (list_id, round)
);
CREATE TABLE IF NOT EXISTS round_ideas (
  list_id TEXT NOT NULL, round INTEGER NOT NULL, pos INTEGER NOT NULL,   -- pos: order shown, from 0
  idea_key TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL,
  src TEXT NOT NULL,                                  -- ai, starter, or rec (added live because they circled a similar idea)
  lo INTEGER NOT NULL DEFAULT 0, hi INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'none',               -- none, kept, top (kept and in the top 3), cut, have
  rank INTEGER NOT NULL DEFAULT 0,                    -- place on the Rank list when kept, else 0
  changed_day TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (list_id, round, pos)
);

-- Export for training (see 0011 for the newer query with the backfill column), one row per idea shown (copy into the D1 console, or save as JSON with
--   npx wrangler d1 execute wishwell-ideas --remote --json --command "<the query>" > rounds.json):
-- SELECT r.list_id, r.round, r.day, r.hour, r.surface, r.source, r.for_who, r.age, r.lean, r.style, r.budget, r.ints, r.quiz, r.has_details,
--   i.pos, i.idea_key, i.title, i.category, i.src, i.lo, i.hi, i.outcome, i.rank
-- FROM rounds r JOIN round_ideas i ON i.list_id = r.list_id AND i.round = r.round
-- ORDER BY r.day DESC, r.hour DESC, r.list_id, r.round, i.pos;
