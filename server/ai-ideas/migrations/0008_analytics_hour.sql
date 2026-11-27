-- Website page counter: add the hour (0 to 23, US Eastern) so counts are hourly totals.
-- Rows counted before this change keep hour = -1 ("before hours were kept").
CREATE TABLE IF NOT EXISTS analytics_new (
  day   TEXT NOT NULL,              -- YYYY-MM-DD, US Eastern
  hour  INTEGER NOT NULL DEFAULT -1,-- 0 to 23, US Eastern; -1 for counts from before hours were kept
  page  TEXT NOT NULL,
  event TEXT NOT NULL,
  ref   TEXT NOT NULL,
  dev   TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, page, event, ref, dev)
);
INSERT OR IGNORE INTO analytics_new (day, hour, page, event, ref, dev, n) SELECT day, -1, page, event, ref, dev, n FROM analytics;
DROP TABLE analytics;
ALTER TABLE analytics_new RENAME TO analytics;

-- To read the counts, newest first (hour -1 shows as "before hours"):
-- SELECT day, CASE WHEN hour < 0 THEN 'before hours' WHEN hour = 0 THEN '12 AM' WHEN hour < 12 THEN hour || ' AM' WHEN hour = 12 THEN '12 PM' ELSE (hour - 12) || ' PM' END AS hour_et, page, event, CASE WHEN ref = '' THEN '(direct)' ELSE ref END AS referrer, dev AS device, n AS count FROM analytics ORDER BY day DESC, hour DESC, n DESC;
