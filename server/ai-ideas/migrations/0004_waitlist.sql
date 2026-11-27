-- Launch waitlist: emails people typed into "Notify me at launch" on the website.
-- Only the email (trimmed, lowercased) and the day it was added. No IP, device id or name.
-- The Worker also creates this table itself if it's missing.
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  added TEXT NOT NULL
);
