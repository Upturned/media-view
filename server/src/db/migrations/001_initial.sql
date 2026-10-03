-- Initial schema (technical doc §6). Timestamps are Unix milliseconds.

CREATE TABLE folders (
  id            INTEGER PRIMARY KEY,
  uuid          TEXT    NOT NULL UNIQUE,
  module        TEXT    NOT NULL CHECK (module IN ('images','videos','audio','texts')),
  parent_id     INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('category','subcategory','album','inbox')),
  name          TEXT    NOT NULL,
  rel_path      TEXT    NOT NULL COLLATE NOCASE,
  description   TEXT,
  cover_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  missing_since INTEGER,
  UNIQUE (module, rel_path),
  CHECK ((kind IN ('category','inbox')) = (parent_id IS NULL))
);
CREATE INDEX folders_parent ON folders(parent_id);
CREATE UNIQUE INDEX folders_one_inbox ON folders(module) WHERE kind = 'inbox';

CREATE TRIGGER folders_parent_not_album BEFORE INSERT ON folders
WHEN NEW.parent_id IS NOT NULL
 AND (SELECT kind FROM folders WHERE id = NEW.parent_id) IN ('album','inbox')
BEGIN SELECT RAISE(ABORT, 'albums cannot contain folders'); END;

CREATE TRIGGER folders_parent_not_album_upd BEFORE UPDATE OF parent_id ON folders
WHEN NEW.parent_id IS NOT NULL
 AND (SELECT kind FROM folders WHERE id = NEW.parent_id) IN ('album','inbox')
BEGIN SELECT RAISE(ABORT, 'albums cannot contain folders'); END;

CREATE TABLE files (
  id            INTEGER PRIMARY KEY,
  media_type    TEXT    NOT NULL CHECK (media_type IN ('image','video','audio','text')),
  folder_id     INTEGER NOT NULL REFERENCES folders(id),
  category_id   INTEGER NOT NULL REFERENCES folders(id),
  filename      TEXT    NOT NULL,
  rel_path      TEXT    NOT NULL COLLATE NOCASE,
  ext           TEXT    NOT NULL,
  size          INTEGER NOT NULL,
  mtime         INTEGER NOT NULL,
  hash          TEXT,
  width         INTEGER,
  height        INTEGER,
  favorited     INTEGER NOT NULL DEFAULT 0,
  description   TEXT,
  added_at      INTEGER NOT NULL,
  missing_since INTEGER,
  recycled      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (media_type, rel_path)
);
CREATE INDEX files_folder   ON files(folder_id);
CREATE INDEX files_category ON files(category_id);
CREATE INDEX files_hash     ON files(hash);
CREATE INDEX files_fav      ON files(favorited) WHERE favorited = 1;

CREATE TABLE tag_types (
  id         INTEGER PRIMARY KEY,
  key        TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL,
  icon       TEXT,
  position   INTEGER NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id            INTEGER PRIMARY KEY,
  type_id       INTEGER NOT NULL REFERENCES tag_types(id),
  name          TEXT    NOT NULL,
  name_norm     TEXT    NOT NULL,
  description   TEXT,
  cover_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (type_id, name_norm)
);
CREATE INDEX tags_name ON tags(name_norm);

CREATE TABLE tag_aliases (
  type_id    INTEGER NOT NULL REFERENCES tag_types(id),
  alias_norm TEXT    NOT NULL,
  alias      TEXT    NOT NULL,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (type_id, alias_norm)
);

CREATE TABLE tag_implications (
  tag_id         INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  implied_tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (tag_id, implied_tag_id),
  CHECK (tag_id <> implied_tag_id)
);
CREATE INDEX tag_implications_rev ON tag_implications(implied_tag_id);

CREATE TABLE file_tags (
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  source  TEXT    NOT NULL CHECK (source IN ('manual','implied')),
  PRIMARY KEY (file_id, tag_id)
);
CREATE INDEX file_tags_tag ON file_tags(tag_id);

CREATE TABLE tag_type_fields (
  id       INTEGER PRIMARY KEY,
  type_id  INTEGER NOT NULL REFERENCES tag_types(id) ON DELETE CASCADE,
  key      TEXT    NOT NULL,
  label    TEXT    NOT NULL,
  kind     TEXT    NOT NULL CHECK (kind IN
             ('text','longtext','number','date','link','choice','image','tagref')),
  options  TEXT,
  position INTEGER NOT NULL,
  UNIQUE (type_id, key)
);

CREATE TABLE tag_field_values (
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES tag_type_fields(id) ON DELETE CASCADE,
  value    TEXT,
  file_id  INTEGER REFERENCES files(id) ON DELETE SET NULL,
  PRIMARY KEY (tag_id, field_id)
);

CREATE TABLE tag_field_refs (
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  field_id   INTEGER NOT NULL REFERENCES tag_type_fields(id) ON DELETE CASCADE,
  ref_tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  PRIMARY KEY (tag_id, field_id, ref_tag_id)
);

CREATE TABLE collections (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  description   TEXT,
  cover_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  file_id       INTEGER NOT NULL REFERENCES files(id)       ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  added_at      INTEGER NOT NULL,
  PRIMARY KEY (collection_id, file_id)
);
CREATE INDEX collection_items_order ON collection_items(collection_id, position);
CREATE INDEX collection_items_file  ON collection_items(file_id);

CREATE TABLE recycle_items (
  id                 INTEGER PRIMARY KEY,
  entity             TEXT    NOT NULL CHECK (entity IN ('file','folder')),
  entity_id          INTEGER NOT NULL,
  original_rel_path  TEXT    NOT NULL,
  original_parent_id INTEGER,
  stored_name        TEXT    NOT NULL,
  recycled_at        INTEGER NOT NULL
);

CREATE TABLE health_issues (
  id          INTEGER PRIMARY KEY,
  kind        TEXT    NOT NULL,
  severity    TEXT    NOT NULL CHECK (severity IN ('error','warning','info')),
  subject     TEXT    NOT NULL,
  payload     TEXT    NOT NULL,
  detected_at INTEGER NOT NULL,
  UNIQUE (kind, subject)
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
