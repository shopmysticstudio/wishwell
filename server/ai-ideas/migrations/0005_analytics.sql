-- Website page counter: page views and a few button clicks per day (per hour since 0008).
-- No ids, addresses or full URLs; ref is the referring site's domain only (views only).
CREATE TABLE IF NOT EXISTS analytics (
  day   TEXT NOT NULL,    -- YYYY-MM-DD, US Eastern
  page  TEXT NOT NULL,    -- one of the site's pages, or "other"
  event TEXT NOT NULL,    -- view, try_free, buy_key, play_badge, waitlist_signup, key_unlock
  ref   TEXT NOT NULL,    -- referring domain for views, "" for direct or same site
  dev   TEXT NOT NULL,    -- phone or desktop
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page, event, ref, dev)
);
