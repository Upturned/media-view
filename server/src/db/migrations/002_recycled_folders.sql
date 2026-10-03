-- Recycled folders stay in the DB (with their whole subtree) so restore is lossless (technical doc §8.6).
-- While recycled, their rows and their files' rows live under the ':bin/<recycle id>/' path namespace,
-- which can't collide with real paths (':' is not allowed in Windows names).
ALTER TABLE folders ADD COLUMN recycled INTEGER NOT NULL DEFAULT 0;
