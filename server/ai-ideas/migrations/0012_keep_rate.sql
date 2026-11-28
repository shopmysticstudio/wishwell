-- Keep rate by round number: (kept + top) / shown, for round 1 vs round 3 and so on, per source
-- (ai, starter, rec, wild) and for all sources together. Only lists where at least one idea was kept,
-- ranked, cut or marked "have" count, so lists nobody touched don't pull it down. No names or details.
-- Dry runs are never logged, so they are not in here. Read it with: SELECT * FROM keep_rate ORDER BY round, src;
CREATE VIEW IF NOT EXISTS keep_rate AS
WITH touched AS (SELECT list_id FROM round_ideas GROUP BY list_id HAVING SUM(outcome <> 'none') > 0),
s AS (SELECT i.round, i.src, i.list_id, i.outcome FROM round_ideas i JOIN touched t ON t.list_id = i.list_id
      UNION ALL SELECT i.round, 'all', i.list_id, i.outcome FROM round_ideas i JOIN touched t ON t.list_id = i.list_id)
SELECT round, src, COUNT(DISTINCT list_id) AS lists, COUNT(*) AS shown,
  SUM(outcome = 'kept') AS kept, SUM(outcome = 'top') AS top, SUM(outcome = 'cut') AS cut, SUM(outcome = 'have') AS have,
  ROUND(1.0 * SUM(outcome IN ('kept', 'top')) / COUNT(*), 3) AS keep_rate
FROM s GROUP BY round, src;
