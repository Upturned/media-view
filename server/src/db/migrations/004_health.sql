-- Library Health (technical doc §7.4, milestone 7).

-- Untagged images: how each image arrived ('app' = imported, copied or created by the app; 'scan' =
-- found on disk), whether its NEW mark was seen, and whether the user chose to leave it untagged.
ALTER TABLE files ADD COLUMN origin TEXT NOT NULL DEFAULT 'app' CHECK (origin IN ('app', 'scan'));
ALTER TABLE files ADD COLUMN seen INTEGER NOT NULL DEFAULT 1;
ALTER TABLE files ADD COLUMN untagged_ok INTEGER NOT NULL DEFAULT 0;

-- Images already in a library aren't "new": only scans after the first one mark arrivals.
INSERT OR IGNORE INTO settings (key, value) SELECT 'first_scan_done', '1' WHERE EXISTS (SELECT 1 FROM files);

-- The Recycle Bin also holds stray files the app doesn't track (a "wrong file type" sent to the bin):
-- entity 'other', entity_id 0, the file is found by its stored name.
CREATE TABLE recycle_items_new (
  id                 INTEGER PRIMARY KEY,
  entity             TEXT    NOT NULL CHECK (entity IN ('file','folder','other')),
  entity_id          INTEGER NOT NULL,
  original_rel_path  TEXT    NOT NULL,
  original_parent_id INTEGER,
  stored_name        TEXT    NOT NULL,
  recycled_at        INTEGER NOT NULL
);
INSERT INTO recycle_items_new SELECT id, entity, entity_id, original_rel_path, original_parent_id, stored_name, recycled_at FROM recycle_items;
DROP TABLE recycle_items;
ALTER TABLE recycle_items_new RENAME TO recycle_items;
