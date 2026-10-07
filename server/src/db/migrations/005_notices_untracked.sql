-- Library Health, after the M7 design review (technical doc §7.4).

-- A fourth level, 'notice' (white): things that aren't problems, e.g. a video the scan moved to Videos\.
CREATE TABLE health_issues_new (
  id          INTEGER PRIMARY KEY,
  kind        TEXT    NOT NULL,
  severity    TEXT    NOT NULL CHECK (severity IN ('error','warning','info','notice')),
  subject     TEXT    NOT NULL,
  payload     TEXT    NOT NULL,
  detected_at INTEGER NOT NULL,
  UNIQUE (kind, subject)
);
INSERT INTO health_issues_new SELECT id, kind, severity, subject, payload, detected_at FROM health_issues;
DROP TABLE health_issues;
ALTER TABLE health_issues_new RENAME TO health_issues;

-- Files the user chose to ignore (unsupported formats, leftover wrong types): they stay where they are,
-- the scan stops reporting them, and the Health page lists them under "Not tracked".
CREATE TABLE untracked_files (
  rel_path   TEXT    PRIMARY KEY COLLATE NOCASE,
  ext        TEXT    NOT NULL,
  reason     TEXT    NOT NULL CHECK (reason IN ('unsupported', 'wrong_type')),
  ignored_at INTEGER NOT NULL
);

-- How many files of each format were ignored or recorded, ever (not recounted from disk): which
-- formats are worth supporting next.
CREATE TABLE format_stats (
  ext      TEXT    PRIMARY KEY,
  ignored  INTEGER NOT NULL DEFAULT 0,
  recorded INTEGER NOT NULL DEFAULT 0
);
