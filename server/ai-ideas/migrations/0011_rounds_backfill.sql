-- Rounds shared later from picks made before the log started (the one-time "Share your past picks" prompt).
-- Their quiz answers are the ones saved on the device at the time of sharing, so they may not match the
-- quiz that produced older rounds: give them less weight when training.
ALTER TABLE rounds ADD COLUMN backfill INTEGER NOT NULL DEFAULT 0;

-- Export for training, one row per idea shown (replaces the query in 0009):
--   npx wrangler d1 execute wishwell-ideas --remote --json --command "<the query>" > rounds.json
-- SELECT r.list_id, r.round, r.day, r.hour, r.surface, r.source, r.for_who, r.age, r.lean, r.style, r.budget, r.ints, r.quiz, r.has_details, r.backfill,
--   i.pos, i.idea_key, i.title, i.category, i.src, i.lo, i.hi, i.outcome, i.rank
-- FROM rounds r JOIN round_ideas i ON i.list_id = r.list_id AND i.round = r.round
-- ORDER BY r.day DESC, r.hour DESC, r.list_id, r.round, i.pos;
