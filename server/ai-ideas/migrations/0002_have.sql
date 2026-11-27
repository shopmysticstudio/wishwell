-- People can mark an AI idea as "already have it": a sign the idea is a real, wanted gift.
ALTER TABLE ideas ADD COLUMN have INTEGER NOT NULL DEFAULT 0;
