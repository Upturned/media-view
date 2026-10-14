-- Local profiles (docs/profiles.md §6): who is using the library. Stars move from files.favorited to
-- profile_favorites, inside this migration, so no order of builds can drop the column before the copy.

CREATE TABLE profiles (
  id              INTEGER PRIMARY KEY,
  uuid            TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  name_norm       TEXT    NOT NULL UNIQUE,
  picture_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  color           TEXT    NOT NULL,
  pass_hash       TEXT,
  prefs           TEXT    NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_used_at    INTEGER
);

CREATE TABLE profile_favorites (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_id    INTEGER NOT NULL REFERENCES files(id)    ON DELETE CASCADE,
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (profile_id, file_id)
);
CREATE INDEX profile_favorites_file ON profile_favorites(file_id);

CREATE TABLE profile_tags (
  tag_id     INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  role       TEXT    NOT NULL CHECK (role IN ('creator','subject')),
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tag_id, role)
);
CREATE INDEX profile_tags_profile ON profile_tags(profile_id);

ALTER TABLE collections ADD COLUMN created_by INTEGER REFERENCES profiles(id) ON DELETE SET NULL;

-- The first profile, with a placeholder name: the server renames it to the Windows user on first open
-- (profiles.nameFirst), and the browser hands over its saved preferences (the _import marker).
INSERT INTO profiles (uuid, name, name_norm, color, prefs, created_at, updated_at)
VALUES (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-'
              || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
        'Me', 'me', '#ff4b2b', '{"_import":true}',
        CAST(unixepoch('subsec') * 1000 AS INTEGER), CAST(unixepoch('subsec') * 1000 AS INTEGER));

INSERT INTO profile_favorites (profile_id, file_id, added_at)
SELECT (SELECT id FROM profiles), id, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM files WHERE favorited = 1;

INSERT INTO settings (key, value) VALUES ('profiles.nameFirst', '1');

DROP INDEX files_fav;
ALTER TABLE files DROP COLUMN favorited;
