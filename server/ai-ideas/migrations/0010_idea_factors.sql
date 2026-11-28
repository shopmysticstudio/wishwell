-- Gift map (beta draft): extra factors per idea, keyed like the idea pool (ideas.key).
-- f is JSON: {"age":[kid,teen,adult] as 0 or 1, "hands", "social", "lasting", "outdoor", "skill" each 0 to 4,
-- "ints": up to 3 interests}. Scored in chunks by the small model through /map/score. No user data.
CREATE TABLE IF NOT EXISTS idea_factors (key TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, f TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', day TEXT NOT NULL);
