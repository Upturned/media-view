-- Duplicates the user chose to keep as separate images ("Keep all copies"): the scan stops reporting
-- the group while it holds only these images. A new copy brings the group back.
CREATE TABLE duplicates_kept (
  hash     TEXT    PRIMARY KEY,
  file_ids TEXT    NOT NULL, -- comma-separated ids of the copies kept
  kept_at  INTEGER NOT NULL
);
