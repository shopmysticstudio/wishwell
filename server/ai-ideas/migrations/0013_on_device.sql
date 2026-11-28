-- Beta on-device ranking. What the phone reports back, so the idea pool can be fixed in updates.
-- Anonymous: no list id, device id, network, name or Details text. Only generic idea titles, interest
-- names, quiz labels and single plain words, with counts.

-- Pairs of ideas the phone found to be near repeats of each other (similarity 0 to 100).
CREATE TABLE IF NOT EXISTS finding_dups (a TEXT NOT NULL, b TEXT NOT NULL, sim INTEGER NOT NULL DEFAULT 0, n INTEGER NOT NULL DEFAULT 0, last_day TEXT NOT NULL, PRIMARY KEY (a, b));
-- Interest words that matched nothing in the pool well. A word from Details is only kept when it was
-- typed in lowercase, or when its hash matches a known franchise or brand word (never a person's name).
-- filled_day: when the leftover-AI job wrote pool ideas for it.
CREATE TABLE IF NOT EXISTS finding_gaps (term TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, last_day TEXT NOT NULL, filled_day TEXT NOT NULL DEFAULT '');
-- Which interest word, quiz label or interest picked which pool idea, and what happened to it.
CREATE TABLE IF NOT EXISTS finding_matches (term TEXT NOT NULL, key TEXT NOT NULL, shown INTEGER NOT NULL DEFAULT 0, kept INTEGER NOT NULL DEFAULT 0, cut INTEGER NOT NULL DEFAULT 0, last_day TEXT NOT NULL, PRIMARY KEY (term, key));
-- Pool ideas written by the leftover-AI job for an unmatched interest word.
CREATE TABLE IF NOT EXISTS gap_ideas (key TEXT PRIMARY KEY, term TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL, lo INTEGER NOT NULL DEFAULT 0, hi INTEGER NOT NULL DEFAULT 0, why TEXT NOT NULL DEFAULT '', day TEXT NOT NULL);

-- Swipe links: the giver's phone stores a deck of up to 24 generic idea titles; the person it's for swipes
-- them once with no sign-up. Kept 14 days (exp in seconds). No names, device ids or networks.
CREATE TABLE IF NOT EXISTS swipes (id TEXT PRIMARY KEY, deck TEXT NOT NULL, votes TEXT NOT NULL DEFAULT '', exp INTEGER NOT NULL);
-- Swipe totals per idea, anonymous, for training.
CREATE TABLE IF NOT EXISTS swipe_votes (key TEXT PRIMARY KEY, title TEXT NOT NULL, likes INTEGER NOT NULL DEFAULT 0, passes INTEGER NOT NULL DEFAULT 0, last_day TEXT NOT NULL);
