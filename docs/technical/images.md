# media-view v2 — Images Module · Technical Design

> **Version:** 2.0 (draft) · **Module:** Images · **Companion to:** `docs/user-guide/images.md`
> This document describes how v2 is built: stack, data model, the disk ↔ database reconciliation, tag logic, search, API and frontend. Behaviour visible to the user is specified in the user guide; where the two disagree, the user guide wins and this document gets fixed.

---

## 1. Goals and constraints

- **Offline, local, single user.** The network is used only by `npm install` and, when the user enables it, by the separate Search and Download process (`docs/search-and-download.md`). No CDNs, no remote fonts, no telemetry.
- **Disk is what you see, the database is what we trust.** Folders and files are real; everything the app knows about them (kinds, tags, collections, descriptions) lives in SQLite. When disk and DB disagree, the DB is authoritative and the difference is surfaced on Library Health — never silently "fixed" by deleting data.
- **Stable identity.** Every folder and file has a DB id; URLs and API calls use ids, never paths. Identity survives renames and moves done outside the app.
- **One library, many modules.** The schema is shared across media types from day one. Images is the first module; Videos, Audio and Text-Writer plug into the same tables.
- **Scale target:** ~50,000 images per library with instant-feeling browsing (the MVP target was 15,000).
- **Desktop app later.** Nothing in the design may depend on being served from a browser tab; the same code must run inside Electron (§14).

Out of scope for v2: multi-user, network access from other devices, cloud sync.

---

## 2. Stack

| Layer           | Choice                                   | Notes                                                        |
|-----------------|------------------------------------------|--------------------------------------------------------------|
| Runtime         | Node.js (current LTS)                    |                                                              |
| HTTP server     | Hono + `@hono/node-server`               | Typed routes; RPC client (`hc`) shared with the frontend     |
| Validation      | Zod + `@hono/zod-validator`              | Request schemas double as TypeScript types                   |
| Database        | SQLite via `better-sqlite3`              | Synchronous, fast, WAL mode; one DB file per library         |
| Images          | `sharp`                                  | Thumbnails, dimensions, format detection                     |
| File watching   | `chokidar`                               | Live reconciliation while the app is open (§7.5)             |
| Frontend        | Svelte 5 + Vite                          | Built to static files, served by Hono                        |
| Language        | TypeScript everywhere                    | `strict` mode                                                |
| Markdown        | `marked` + `DOMPurify`                   | Tag wiki descriptions; bundled, offline                      |
| Tests           | Vitest                                   | Server services tested against temporary libraries           |

All dependencies are installed locally and bundled. `sharp` and `better-sqlite3` ship prebuilt native binaries; they need network only during `npm install`.

---

## 3. Architecture

A single Node process serves both the API and the built frontend, bound to `127.0.0.1` only.

```
Browser / Electron window
        │  HTTP (localhost)
        ▼
┌───────────────────────── Node process ─────────────────────────┐
│  Hono app                                                      │
│   ├── /api/*        routes → services                          │
│   ├── /media/*      originals + thumbnails (by id)             │
│   └── /*            built Svelte app (static)                  │
│                                                                │
│  Services (pure logic, no HTTP)                                │
│   library · folders · files · tags · collections · search      │
│   health · recycle · thumbnails                                │
│                                                                │
│  Background workers                                            │
│   scanner/reconciler · watcher · thumbnail queue · hasher      │
│                                                                │
│  Open library ──► <library>/.mediaview/library.db (SQLite)       │
│                   <library>/Images/…            (files)        │
└────────────────────────────────────────────────────────────────┘
```

Rules of the road:

- **Routes are thin.** They validate input (Zod), call one service function, and shape the response. All logic lives in services so it can be tested without HTTP and reused by Electron IPC later.
- **Services never trust client paths.** The client sends ids; services resolve them to paths through the DB and verify the resolved path stays inside the library root.
- **One open library at a time.** Switching library closes the DB and workers and opens the new one.

### 3.1 Logging

- Location: `<library>/.mediaview/logs/YYYY-MM-DD.log`, one file per day, **JSON Lines** (one object per line) so they're both readable and greppable:

```json
{"ts":1790000000000,"level":"error","area":"api","msg":"POST /api/files/move failed","data":{"code":"EBUSY","ids":[12,13]}}
{"ts":1790000000500,"level":"info","area":"health","msg":"fix applied","data":{"issue":"loose_files","action":"move_to_new_album","batch":"b-7f3a","files":42}}
```

- **What is logged:** unhandled API errors (with request, not with file contents), every Library Health fix — each item of an *Apply to all* is a separate line sharing a `batch` id — every bulk operation (move, copy, rename, recycle, tag changes on more than one file), library open/close and reconciliation summaries.
- **Retention:** at startup and once a day, delete the oldest files while there are more than **100 files** or more than **50 MB** — whichever limit is hit first. There is no age limit. A single day's file is capped at 10 MB (further lines of that day go to `YYYY-MM-DD.1.log`, counted in the same budget).
- Errors before a library is open (e.g. it failed to open) go to `%APPDATA%\media-view\logs\` with the same rules.
- `lib/log.ts` is the only writer; it appends synchronously-buffered and flushes on exit.

---

## 4. Repository layout

A fresh repository (no code carried over wholesale; see §16 for what is ported).

```
media-view/
├── package.json              # npm workspaces: server, web, shared
├── shared/                   # types and pure helpers used by both sides
│   └── src/
│       ├── search-syntax.ts  # query parser (§11) — runs client-side for highlighting too
│       ├── tag-names.ts      # normalization rules (§10.1)
│       └── types.ts
├── server/
│   └── src/
│       ├── index.ts          # boot: config, open last library, start Hono
│       ├── app.ts            # Hono app, route mounting; exports AppType for hc
│       ├── config.ts         # app-level config (%APPDATA%)
│       ├── db/
│       │   ├── connection.ts
│       │   ├── migrations/   # 001_initial.sql, 002_…
│       │   └── migrate.ts
│       ├── routes/           # one file per resource (§12)
│       ├── services/         # one file per domain
│       ├── workers/          # scanner, watcher, thumbnails, hasher
│       └── lib/              # paths, markers, hashing, windows helpers
├── web/
│   ├── index.html
│   └── src/
│       ├── main.ts
│       ├── router.ts
│       ├── api.ts            # hc<AppType> client
│       ├── pages/            # one component per page (§13)
│       ├── components/
│       ├── stores/
│       ├── themes/           # darkroom (v1); more per docs/styles.md
│       └── public/styles/    # self-contained style mockups for Check styles
└── docs/
    ├── user-guide/
    ├── technical/
    └── build-pdf.js
```

---

## 5. Configuration and the library

### 5.1 App config

Stored outside any library, in `%APPDATA%\media-view\config.json`:

```json
{
  "lastLibrary": "D:\\MyLibrary",
  "recentLibraries": ["D:\\MyLibrary", "E:\\Work Library"],
  "port": 4321,
  "ui": { "theme": "darkroom" }
}
```

UI preferences that are per-machine (theme, grid columns) live here or in `localStorage`; anything describing the library's content lives in the library DB.

### 5.2 Library layout

```
<library>/
├── .mediaview/                 # hidden (attrib +h)
│   ├── library.json          # { "id": "<uuid>", "formatVersion": 1, "createdAt": … }
│   ├── library.db            # + library.db-wal, library.db-shm
│   ├── thumbnails/           # content-addressed (§9)
│   ├── recycle-bin/          # recycled items, named by recycle id (§8.6)
│   └── logs/                 # JSON Lines logs (§3.1)
└── Images/                   # module root; later Videos/, Audio/, Texts/
```

- **Opening a library:** validate `library.json`, open the DB, run pending migrations, start a full reconciliation (§7) in the background, start the watcher. The UI is usable immediately with what the DB already knows.
- **Creating a library:** create the folder structure, `library.json` with a fresh uuid, and an empty migrated DB with the default tag types (§10.2).
- **Opening a folder that isn't a library** offers to create one there. Existing folders inside `Images/` are then imported through the normal reconciliation flow.

### 5.3 Paths

- All paths stored in the DB are **relative to the module root**, use `/` as separator and are Unicode-NFC normalized: `Fantasy/Elves/Portraits/aerin.png`.
- Comparisons use `COLLATE NOCASE` to match Windows' case-insensitive file system.
- `lib/paths.ts` is the only place that converts between DB paths and absolute OS paths, and it asserts the result stays inside the library root.

---

## 6. Data model

SQLite, `PRAGMA foreign_keys = ON`, `journal_mode = WAL`. Migrations are numbered SQL files; the applied version is stored in `PRAGMA user_version`. Timestamps are Unix milliseconds (`INTEGER`).

### 6.1 Overview

```
folders ─┬─< folders (parent_id)
         └─< files ─┬─< file_tags >── tags ─┬─< tag_aliases
                    │                       ├─< tag_implications (self)
                    │                       ├─< tag_field_values >── tag_type_fields ── tag_types
                    │                       └── tag_types
                    └─< collection_items >── collections
recycle_items · health_issues · settings
```

### 6.2 Folders

```sql
CREATE TABLE folders (
  id            INTEGER PRIMARY KEY,
  uuid          TEXT    NOT NULL UNIQUE,              -- written into the marker file
  module        TEXT    NOT NULL CHECK (module IN ('images','videos','audio','texts')),
  parent_id     INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('category','subcategory','album','inbox')),
  name          TEXT    NOT NULL,
  rel_path      TEXT    NOT NULL COLLATE NOCASE,
  description   TEXT,
  cover_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  missing_since INTEGER,                              -- set when not found on disk
  UNIQUE (module, rel_path),
  CHECK ((kind IN ('category','inbox')) = (parent_id IS NULL))
);
CREATE INDEX folders_parent ON folders(parent_id);
CREATE UNIQUE INDEX folders_one_inbox ON folders(module) WHERE kind = 'inbox';
```

- **The Inbox** is a special top-level folder (`Images/Inbox/`) that behaves as an album: it holds only images, exactly one exists per module, and it can't be renamed, moved or recycled. It is created with the library and recreated automatically (folder + marker) whenever it is found missing; it never raises a `missing_folder` issue. Imports without an explicit target album go there.

- The tree is an adjacency list (`parent_id`) plus a materialized path (`rel_path`). "Everything under X" is a range on the indexed path, `rel_path >= :prefix || '/' AND rel_path < :prefix || '0'` ('0' is the character right after '/'); ancestors come from the path segments or a recursive CTE.
- **Structural rules** (an album's or inbox's parent is never an album; categories and the inbox are top-level; albums and the inbox hold no folders) are enforced in `services/folders.ts`, backed by triggers as a safety net:

```sql
CREATE TRIGGER folders_parent_not_album BEFORE INSERT ON folders
WHEN NEW.parent_id IS NOT NULL
 AND (SELECT kind FROM folders WHERE id = NEW.parent_id) IN ('album','inbox')
BEGIN SELECT RAISE(ABORT, 'albums cannot contain folders'); END;
-- same trigger for UPDATE OF parent_id
```

- Moving or renaming a folder rewrites `rel_path` for the folder, all descendant folders and all descendant files in one transaction (`UPDATE … SET rel_path = :new || substr(rel_path, length(:old) + 1) WHERE rel_path >= :old || '/' AND rel_path < :old || '0'`).
- **Path prefixes never use `LIKE`.** `_` and `%` are wildcards in `LIKE` and `_` is common in file names, so `my_album/%` would also match `myXalbum/…`. All prefix matches go through one helper in `lib/paths.ts` (`underPrefix`) that builds the range above: it compares the column directly, so the column's `NOCASE` collation applies and the `(…, rel_path)` index is used. Tests cover names containing `_` and `%`, and case differences.

### 6.3 Files

```sql
CREATE TABLE files (
  id            INTEGER PRIMARY KEY,
  media_type    TEXT    NOT NULL CHECK (media_type IN ('image','video','audio','text')),
  folder_id     INTEGER NOT NULL REFERENCES folders(id),   -- an album or the inbox
  category_id   INTEGER NOT NULL REFERENCES folders(id),   -- denormalized top-level folder (the inbox for inbox files)
  filename      TEXT    NOT NULL,
  rel_path      TEXT    NOT NULL COLLATE NOCASE,
  ext           TEXT    NOT NULL,
  size          INTEGER NOT NULL,
  mtime         INTEGER NOT NULL,
  hash          TEXT,                                      -- null until hashed (§8.2)
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
```

- **Every file on disk has a row**, created by reconciliation — not lazily as in the MVP. This is what makes counts, search and Library Health possible.
- A file belongs to exactly one album (`folder_id`). `category_id` is redundant with the path but kept for cheap per-category queries; the folder service keeps it correct on moves.
- Files are **never deleted from the DB because they went missing** — only `missing_since` is set. Rows are deleted only when the user deletes permanently or chooses *Forget* on Library Health.

### 6.4 Tags

```sql
CREATE TABLE tag_types (
  id         INTEGER PRIMARY KEY,
  key        TEXT    NOT NULL UNIQUE,             -- 'general', 'character', … used in search syntax
  name       TEXT    NOT NULL,                    -- display name
  color      TEXT    NOT NULL,                    -- '#RRGGBB'
  icon       TEXT,
  position   INTEGER NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0           -- the type new untyped tags get (exactly one)
);

CREATE TABLE tags (
  id            INTEGER PRIMARY KEY,
  type_id       INTEGER NOT NULL REFERENCES tag_types(id),
  name          TEXT    NOT NULL,                 -- as displayed
  name_norm     TEXT    NOT NULL,                 -- normalized (§10.1)
  description   TEXT,                             -- Markdown
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
```

- An alias lives in the **type of its target tag** and must not collide with a tag name of that type (service-level check).
- `file_tags.source` stores whether a link was added by the user or by an implication. If a tag is both, `manual` wins.

### 6.5 Custom fields

```sql
CREATE TABLE tag_type_fields (
  id       INTEGER PRIMARY KEY,
  type_id  INTEGER NOT NULL REFERENCES tag_types(id) ON DELETE CASCADE,
  key      TEXT    NOT NULL,                  -- stable identifier
  label    TEXT    NOT NULL,
  kind     TEXT    NOT NULL CHECK (kind IN
             ('text','longtext','number','date','link','choice','image','tagref')),
  options  TEXT,                              -- JSON: choice list, tagref allowed types, multi, …
  position INTEGER NOT NULL,
  UNIQUE (type_id, key)
);

CREATE TABLE tag_field_values (
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES tag_type_fields(id) ON DELETE CASCADE,
  value    TEXT,                              -- text/longtext/number/date/link/choice
  file_id  INTEGER REFERENCES files(id) ON DELETE SET NULL,   -- kind = image
  PRIMARY KEY (tag_id, field_id)
);

CREATE TABLE tag_field_refs (                 -- kind = tagref (possibly multiple, ordered)
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  field_id   INTEGER NOT NULL REFERENCES tag_type_fields(id) ON DELETE CASCADE,
  ref_tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  PRIMARY KEY (tag_id, field_id, ref_tag_id)
);
```

- Values are stored as text and validated against the field `kind` by the service (numbers parse, dates are ISO `YYYY-MM-DD`, links are `http(s)://` or `file://`, choices are in `options.choices`).
- Image and tag-reference values use real foreign keys so deleting a file or tag cleans up automatically.
- **Changing a field's kind** is allowed only if all existing values convert; otherwise the UI asks to clear them first.
- **Changing a tag's type** keeps values whose field `key` exists on the new type and discards the rest (with a confirmation listing what will be lost).

### 6.6 Collections

```sql
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
```

Positions are rewritten densely (0..n-1) in one transaction on reorder; collections are small enough that this is cheaper than fractional indexing's complexity.

### 6.7 Recycle bin, health, settings

```sql
CREATE TABLE recycle_items (
  id                 INTEGER PRIMARY KEY,
  entity             TEXT    NOT NULL CHECK (entity IN ('file','folder')),
  entity_id          INTEGER NOT NULL,          -- files.id / folders.id, rows kept
  original_rel_path  TEXT    NOT NULL,
  original_parent_id INTEGER,
  stored_name        TEXT    NOT NULL,          -- name inside .mediaview/recycle-bin/
  recycled_at        INTEGER NOT NULL
);

CREATE TABLE health_issues (
  id          INTEGER PRIMARY KEY,
  kind        TEXT    NOT NULL,                 -- see §7.4
  severity    TEXT    NOT NULL CHECK (severity IN ('error','warning','info')),
  subject     TEXT    NOT NULL,                 -- stable key, e.g. 'folder:12' or 'path:Fantasy/x.png'
  payload     TEXT    NOT NULL,                 -- JSON with details and the suggested fix
  detected_at INTEGER NOT NULL,
  UNIQUE (kind, subject)
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- per-library settings
```

---

## 7. Folders on disk: markers and reconciliation

### 7.1 Marker files

Every folder contains a hidden marker file identifying it. Categories wouldn't strictly need one (top level = category), but get a `.category` marker anyway so folder identity survives renames uniformly.

| Kind         | File           |
|--------------|----------------|
| Category     | `.category`    |
| Sub-category | `.subcategory` |
| Album        | `.album`       |
| Inbox        | `.inbox`       |

Content (JSON, one line):

```json
{"v":1,"library":"<library uuid>","folder":"<folder uuid>"}
```

- Written by the app whenever it creates a folder, and re-created by reconciliation if missing. Hidden via `attrib +h` (`lib/windows.ts`).
- The **DB is the source of truth**. The marker is an identity card: it lets reconciliation recognize a folder that was renamed or moved outside the app, and lets the kinds be rebuilt if the DB is ever lost.
- A marker with a different `library` uuid (folder copied from another library) is treated as unmarked.

### 7.2 Reconciliation

`services/reconcile.ts` compares the module root with the DB; `workers/scanner.ts` runs it one pass at a time (a request during a scan schedules one more pass). It runs on library open, on demand (**Rescan** — on the Library page until Library Health exists) and, scoped to a subtree, when the watcher reports changes.

**Pass 1 — walk the disk.** Collect every directory (with its marker, if any) and every file (`size`, `mtime`). Skip `.mediaview/` and dot-files, **except the known marker files** (§7.1), which are read here to identify each directory.

**Pass 2 — match folders.**

Directories are processed parents first. Rows are assigned by marker identity first, then by path, so a folder renamed in Explorer isn't mistaken for a new folder created at its old path.

1. Marker uuid found in DB → same folder. If its path differs, it was moved/renamed outside the app: update `rel_path` (and descendants) so the app keeps working, clear `missing_since`, and raise an **external move** issue recording the original path (kept if it moves again before review; cleared if it's moved back), so the user can *Keep* or *Undo* it.
   - A marker found in **several** directories (a folder copied in Explorer) identifies only one of them — the one at the DB's path if present, otherwise the first found. The others are treated as unmarked.
   - A marker of this library whose uuid the DB doesn't know (the DB was lost or restored from an old backup) → the folder is re-created with that uuid and the marker's kind.
2. No marker, but a DB folder exists at that path → same folder; rewrite the missing marker.
3. No marker, no DB row → **unmarked folder**. It's **registered right away with an inferred kind**, so its images are visible immediately (e.g. a library created on an existing folder), and an `unmarked_folder` issue asks the user to confirm or change the kind:
   - contains images and no folders → `album`
   - contains folders → `subcategory` (images next to them become loose files)
   - empty → `album` (a guess; the issue is marked `certain: false`)
   - at the top level, always `category`.
4. **Kinds follow position:** a top-level folder is a category, a nested category is a sub-category — so a drawer moved to the top level in Explorer becomes a rack. A folder inside an album or the Inbox isn't registered: it raises **nested in album**, and its images attach to the album.
5. DB folders not matched by any directory → set `missing_since`, raise **missing folder** (except the Inbox, which is recreated).

**Pass 3 — match files.** For each file on disk:

1. DB row at the same path with the same `size` and `mtime` → unchanged (no hashing).
2. DB row at the same path, different `size`/`mtime` → content changed: re-hash, update metadata, regenerate thumbnail. Tags stay.
3. No row at that path → look for rows whose file is gone (`missing_since` set, or path no longer on disk) **with the same size**; only then hash the new file (so a first import hashes nothing up front) and compare hashes:
   - **exactly one** candidate → **moved**: update path and folder, and add it to an **external move** issue grouped by *(old folder → new folder)* — moving 300 files together produces one issue;
   - **several** candidates (identical copies that each had their own tags/favorites) → ambiguous: insert as a new file and raise an **ambiguous_move** issue listing the candidates, so the user picks which record it is. Metadata is never reassigned by guessing;
   - **none** → **new file**, insert.

   A hash match against a row whose file still exists on disk is a copy, not a move — it becomes a new file (and a `duplicate`).
4. DB files not matched → set `missing_since`, raise **missing file**.

New files found on disk get the file's creation time as `added_at` (so "date added" and "new this week" mean something for an imported folder); files imported through the app get the import time.

Files are inserted even when their folder breaks the rules (e.g. loose in a sub-category) so they are never invisible; they get a `folder_id` of the nearest folder and a **rule problem** issue. Such files don't appear in album grids until fixed.

**Pass 4 — rules.** Raise issues for loose files in categories/sub-categories, folders inside albums, and non-image files in `Images/`.

Reconciliation updates the DB to follow what it can prove (moves and renames through marker or hash, metadata refreshes) so the app never shows broken items — but every change made outside the app is also recorded as an issue for the user to confirm or undo. Anything that would lose or restructure data is never applied automatically.

### 7.3 Operations from the app

Every mutating operation (create/rename/move/delete folder or file, import) follows the same pattern:

1. Validate against the rules using the DB.
2. Perform the disk operation.
3. Commit the DB changes in one transaction.
4. If step 3 fails, undo step 2 when possible; otherwise leave it for reconciliation, which will recognize the result through marker or hash.

Watcher events caused by the app's own operations are suppressed through a short-lived "expected changes" set, so they don't trigger redundant reconciliation.

### 7.4 Health issue kinds

| Kind                 | Severity | Subject                 | Suggested fixes                                       |
|----------------------|----------|-------------------------|-------------------------------------------------------|
| `missing_folder`     | error    | folder id               | Recreate (folder + marker) · Forget (delete rows)     |
| `missing_file`       | error    | file id                 | Locate… · Forget                                      |
| `ambiguous_move`     | warning  | path                    | Pick the matching record (it inherits that record's metadata) · Keep as new file |
| `external_move`      | warning  | folder id, or old→new folder pair for files | Keep (acknowledge) · Undo (move back on disk, if the old location is free) |
| `loose_files`        | warning  | parent folder           | Move into a new album · Move into an existing album   |
| `nested_in_album`    | warning  | path                    | Move out to the album's parent · Convert album        |
| `unmarked_folder`    | warning  | path                    | Mark as category / sub-category / album               |
| `wrong_type`         | warning  | path                    | Move to the right module root · Recycle               |
| `duplicate`          | info     | hash                    | Keep one, recycle the others                          |
| `orphan_thumbs`      | info     | —                       | Delete                                                |

"New images" are not an issue kind; they're a filtered view (`added_at` since last visit, no tags) counted as `info` in the summary.

**Summary for the top bar:** `GET /api/health/summary` returns counts per severity; the top bar shows the total, colored by the highest severity present. It's pushed again over `/api/events` whenever issues change.

**Undo of an external move** performs the reverse disk move through the normal operation pattern (§7.3). If the old location is now occupied, the fix is refused with an explanation.

### 7.5 Watcher

`workers/watcher.ts`: `chokidar` watches the module root with `awaitWriteFinish` (files are only processed once their size is stable), ignoring hidden entries (markers included). Events are debounced (~1 s) and trigger a reconciliation (a full one for now; scoping it to the changed subtree is an optimization for the 50k performance pass).

The app's own disk changes are registered in `lib/expected.ts` (path prefixes, ~5 s) and ignored by the watcher, so moving or importing never triggers a redundant scan. Even if one runs, reconciliation is idempotent.

---

## 8. Files

### 8.1 Supported types

Images: `jpg jpeg jfif png gif webp svg avif` (JFIF is JPEG; served as `image/jpeg`). Detected by extension, confirmed by `sharp` when the thumbnail is made (a `.png` that isn't an image becomes a `wrong_type` issue on `file:<id>`, which rescans leave alone). Windows' own `desktop.ini` and `Thumbs.db` are ignored.

### 8.2 Hashing

- Algorithm: **SHA-256** via Node's `crypto`, streamed. Stored as hex.
- Hashing is IO-bound; a dedicated worker hashes in the background with bounded concurrency. Files without a hash yet are fully usable; only move detection and duplicate detection wait for it.
- The `(size, mtime)` pair is the fast "unchanged" check, so a normal startup re-hashes nothing.

### 8.3 Import

Two entry points, same result — files copied into the target album (or the Inbox when no album is given), rows inserted directly (no wait for the watcher). **One file per request**: the client loops, so the import panel shows exact progress and *Cancel* stops between files (design M3 · 06).

- **File picker** (`/api/system/pick-files` → paths) → `POST /api/files/import { folderId?, path }`. The server copies from disk; the original is untouched.
- **Drag and drop** from Explorer. A browser only receives file *contents*, not paths, so the client sends each file as the raw body of `POST /api/files/upload?folderId=&name=`. (In Electron, dropped files expose real paths and use `import` instead.)

Each file is streamed to `.mediaview/tmp/`, hashed on the way, then:

1. **Rejected** by name when it isn't a supported image, with a reason: video / audio ("will have their own module"), known unsupported image formats ("Unsupported format (PSD)…"), anything else ("Not an image.").
2. **Skipped** when an identical image (same hash) is already **in the target album**. An identical image elsewhere is imported normally and shows up as a `duplicate`.
3. **Rejected** when it can't be read (`sharp` metadata; SVGs must contain `<svg`): "Couldn't read the file — it may be damaged or still downloading." The panel offers *Retry unreadable*.
4. Moved into the album; a taken name becomes `name (1).ext` (**renamed**). The row gets the hash, dimensions and `added_at` = now.

Where drops go: on an album page or album card → that album; on the Library page → the Inbox; on a category / sub-category page, loose images go to the Inbox and **each dropped folder becomes a new album there** with its images. Dropped folders are read recursively and flattened. The client logs a summary (`POST /api/files/import-done`).

### 8.4 Move / copy / rename

- Move and rename update `rel_path`, `folder_id`, `category_id`; tags, collections and favorites stay attached through `files.id`. Images only go into albums or the Inbox.
- **Name clashes** on move / copy follow a policy (design M3 · 01): **Keep both** (default — `name (1).ext`), **Replace** (the existing image goes to the Recycle Bin; a starred one is never replaced — it keeps both instead) or **Skip**.
- **Undo a move**: the move returns where each image came from (`undo`); `POST /api/files/undo-move` puts them back (clashes keep both). The toast offers it for 10 s. Copies have no undo (recycle the copies instead).
- **Copy creates a new file** with a new id, keeping hash, dimensions and description; not stars or collections (the copy is a different file). Its tags are copied too — the Copy dialog has a **Copy tags** checkbox, on by default. Same hash → it shows up as a duplicate, which is correct.
- **Rename** changes the base name only (the extension is locked); a name already taken in the folder is an error. Case-only renames work.
- **Bulk rename** (design M3 · 03): `{ ids, pattern, start, digits }`. `#` is the number (from `start`, zero-padded to `digits`), `*` the original name; numbered in the order the ids are given (the grid's current order). Every new name must be unique in its folder — conflicts refuse the whole rename. Renames go through temporary names (on disk and in the DB) so swaps work.
- **Folders**: rename, move (`POST /api/folders/:id/move { parentId }`) — the kind follows the new place (a category moved into a category becomes a sub-category; albums can't go to the top level; never into itself) and the files' `category_id` is refreshed. A name already taken there is an error.
- **Descriptions**, stored only in the DB (the folder on disk is untouched): racks, drawers and albums get a brief one, up to **500** characters, for context; images up to **600**; tag wiki pages up to **20,000** (Markdown, milestone 5).
- **Covers**: a folder's cover must be an image inside it (`PATCH /api/folders/:id { coverFileId }`).

### 8.5 Media serving

- `GET /media/file/:id` — the original, with `Range` support (required for videos later), `Cache-Control: private, max-age` and `ETag` from the hash.
- `GET /media/thumb/:id` — the thumbnail (§9); falls back to generating on demand.
- SVGs are served with `Content-Security-Policy: sandbox` to neutralize embedded scripts.

### 8.6 Recycle bin

Recycling moves the file or folder into `.mediaview/recycle-bin/<recycle id>/<name>`, sets `recycled = 1` on the file — or on the folder, every folder and every file under it (migration 002 adds `folders.recycled`) — and inserts a `recycle_items` row with the original path and parent. While recycled, their rows' paths live under the `:bin/<recycle id>/…` namespace (`:` can't occur in Windows names), so the original names are free again and nothing collides; `absPath()` maps that namespace to the bin folder. All rows, tags and collection memberships remain, so restore is lossless. Recycled items are excluded from every query except the Recycle Bin.

- **Starred images are never recycled**: in a selection they're left out (the client asks first: "Recycle 3 of 5 images?"); a folder containing any is refused with the count.
- **Restore** puts an item back under its original parent; a name taken there keeps both. If that place is gone (missing, recycled, or no longer an album), restore is refused with `LOCATION_GONE` and the user picks a new place (**Restore to…**, `{ targetFolderId }`). A restored folder's kind follows its new place.
- **Delete permanently** removes the disk item and deletes the rows (cascading tags and collection items). **Empty the bin** does it for everything. Both ask first (plain confirmation). The bin is never emptied automatically.

---

## 9. Thumbnails

- Generated by `sharp`: longest side **400 px**, WebP quality 80. Animated GIF/WebP → first frame. SVG → served as-is, no thumbnail.
- **Content-addressed:** `.mediaview/thumbnails/<hash[0..1]>/<hash>.webp`. Thumbnails survive moves and renames, and duplicates share one thumbnail. Until a file is hashed, a temporary thumbnail is keyed by file id and renamed once the hash is known.
- A priority queue with concurrency `max(2, cpus - 2)`: items visible on screen are requested first (the grid reports visible ids), then the background backlog.
- `orphan_thumbs` cleanup deletes thumbnails whose hash no longer belongs to any file.

---

## 10. Tags

### 10.1 Names

- `name` keeps what the user typed (trimmed, inner whitespace collapsed) and is what the UI displays: *red dress*.
- **Space and `_` are the same character for matching.** `name_norm` = NFC → lowercase → `_` replaced by a space → trimmed → whitespace collapsed to one space. So `red dress`, `red_dress` and `Red Dress` are one tag. Uniqueness and lookup (names, aliases, wiki links) always use `name_norm`. A name typed with underscores (`red_dress`) is stored for display with spaces (`red dress`).
- In the **search box** a tag name can't contain spaces (they separate terms), so tags are written with underscores: `#red_dress`. Autocomplete inserts names that way; everywhere else names are shown with spaces.
- Forbidden characters in names: `#`, `:`, `,` and leading `-` (they are search syntax). `[` and `]` are forbidden too (wiki links).

### 10.2 Default tag types and fields

Created with a new library; all are editable and deletable (except that exactly one type must remain default).

| key         | name      | color     | default fields                                                           |
|-------------|-----------|-----------|--------------------------------------------------------------------------|
| `general`   | General   | `#6B7A99` | —                                                                        |
| `character` | Character | `#2E9E5B` | Full name (text), Species (text), Age (number), Related characters (tagref → character, multi) |
| `source`    | Source    | `#B0487A` | Kind (choice: book, game, series, film, comic, other), Author (text), Release date (date) |
| `artist`    | Artist    | `#D08A1E` | Website (link), Social (link)                                            |

`general` is the default type.

### 10.3 Resolving user input

Input like `frodo`, `character:frodo` or `lotr` is resolved by `services/tags.ts#resolve`:

1. Parse an optional `typekey:` prefix.
2. With a type: look up `(type, name_norm)`, then `(type, alias_norm)`.
3. Without a type: look up `name_norm` across all types, then aliases. One match → use it. Several → ambiguous; the autocomplete always lists typed candidates, so the UI never submits an ambiguous name.
4. No match → create a new tag of the given type, or of the default type.

### 10.4 Implications

- Stored as direct edges; the **closure** (all tags implied transitively) is computed with a recursive CTE:

```sql
WITH RECURSIVE closure(id) AS (
  SELECT implied_tag_id FROM tag_implications WHERE tag_id IN (/* file's manual tags */)
  UNION
  SELECT ti.implied_tag_id FROM tag_implications ti JOIN closure c ON ti.tag_id = c.id
)
SELECT id FROM closure;
```

- **Cycles are rejected** when an implication is added (check whether the target already implies the source).
- **Implied links are materialized** in `file_tags` with `source = 'implied'`, so search stays a plain join. For a file, `recomputeImplied(fileId)` = delete its implied rows, compute the closure of its manual tags, insert missing ones as implied. It runs:
  - after a file's manual tags change;
  - for every file carrying tag A, when an implication from A (or anything implying A) is added or removed.
- If the user manually adds a tag that is already implied, its row flips to `manual`. Removing an implied tag directly is not possible (the UI explains which tag implies it).

### 10.5 Aliases and the main name

Creating alias `X` for tag `T` requires that no tag named `X` exists in `T`'s type; if one does, the UI offers a merge instead.

**Make main name** (alias `X` of tag `T`, whose current name is `N`), in one transaction: delete alias `X`; set `T.name = X`, `T.name_norm = norm(X)`; insert `N` as an alias of `T`. Tag ids don't change, so nothing else is touched. Wiki links written with the old name keep working because they resolve through aliases.

### 10.6 Merge (A into B)

One transaction:

1. For each file with A: insert B (`manual` if A was manual on that file or B already was), delete A's link.
2. Repoint A's aliases to B; add A's name as an alias of B (optional, default on).
3. Repoint implications: `A → X` becomes `B → X`, `X → A` becomes `X → B`; drop duplicates and self-edges; reject if a cycle would result.
4. Custom fields: B's values win; empty B fields take A's values. Tag references to A are repointed to B.
5. Description and cover: B's win; if empty, take A's.
6. Delete A; run `recomputeImplied` for the affected files.

Merging across types is allowed; A's field values are carried over only where the field `key` exists on B's type.

### 10.7 Related tags

Computed on demand by co-occurrence, weighted so ubiquitous tags don't dominate:

```sql
SELECT t.id, COUNT(*) AS together,
       COUNT(*) * 1.0 / (SELECT COUNT(*) FROM file_tags WHERE tag_id = t.id) AS affinity
FROM file_tags a
JOIN file_tags b ON b.file_id = a.file_id AND b.tag_id <> a.tag_id
JOIN tags t      ON t.id = b.tag_id
WHERE a.tag_id = :tag
GROUP BY t.id
ORDER BY together * affinity DESC
LIMIT 20;
```

Cached in memory per tag and invalidated when `file_tags` changes for that tag. Fast enough for the scale target; revisit with a precomputed table if not.

### 10.8 Wiki descriptions

- Stored as Markdown. Rendered client-side with `marked`, sanitized with `DOMPurify`.
- `[[type:name]]` and `[[name]]` are expanded by a `marked` extension into links to the tag page, resolved in one batched API call per page render; unresolved links render in a "missing" style (click → create tag).
- **Tooltip text** = the first paragraph, stripped of formatting, truncated to ~200 characters.

---

## 11. Search

### 11.1 Syntax

Implemented once in `shared/search-syntax.ts`, used by the server to build queries and by the client to highlight tokens in the search box.

```
query   := term (WS term)*
term    := ['-' | '~'] ( tagterm | text )   -- '-' exclude, '~' member of the "any of" group
tagterm := '#' [typekey ':'] name        -- explicit tag
         | typekey ':' name              -- shorthand, only if typekey is a known tag type
text    := any other word or "quoted phrase"
```

- In a tag term, `name` is a single word: spaces in tag names are written as `_` (`#red_dress`, `character:aerin_valecrest`) and match through `name_norm` (§10.1).

- Tag terms are resolved through §10.3 (aliases included). Unknown tags produce zero results and a hint, not an error.
- All `~` terms form a single **"any of" group** (booru style): at least one must match. `~` applies to tag terms only.
- The tag sidebar's include / exclude / any-of states are just a UI over this syntax: toggling a chip rewrites the query string and vice versa, so the two never disagree.
- Text terms match against `files.rel_path` (so both file names and folder names), case-insensitive.

### 11.2 Query building

Each term becomes one condition; all conditions are ANDed:

```sql
SELECT f.* FROM files f
WHERE f.media_type = 'image' AND f.recycled = 0
  AND EXISTS     (SELECT 1 FROM file_tags WHERE file_id = f.id AND tag_id = :t1)   -- #sunset
  AND NOT EXISTS (SELECT 1 FROM file_tags WHERE file_id = f.id AND tag_id = :t2)   -- -#people
  AND EXISTS     (SELECT 1 FROM file_tags WHERE file_id = f.id
                  AND tag_id IN (:t3, :t4))                                        -- ~#cat ~#dog
  AND f.rel_path LIKE '%' || :w1 || '%' ESCAPE '\'                                  -- beach (\ % _ in :w1 are escaped)
  AND substr(f.rel_path, 1, length(:scope) + 1) = :scope || '/'                     -- optional folder scope
ORDER BY …
LIMIT :limit OFFSET :offset;
```

- **Scope**: the same endpoint serves album pages, "View all images", Favorites, tag galleries and global search by adding a scope condition (folder subtree, favorited, collection membership).
- **Paging**: server-side, 200 items per page. This replaces the MVP's "load everything and filter in the browser", which doesn't scale to the new target.
- **Random order** must be stable across pages: `ORDER BY (f.id * :seed) % 2147483647`, with a new seed per visit.
- **Counts per tag** for the tag sidebar come from the same filtered set (`GROUP BY tag_id` over the matching file ids), capped to the top 100.

### 11.2a Where searches run (milestone 4 decisions)

- **The top-bar search box** filters the **current grid** when the page has one (album, Inbox, View all, tag gallery) — the scope chip says so — and can switch to *Everywhere*, which opens the Search page. On any other page it opens the Search page. Its suggestions show tags (type color, count, aliases as "alias ⇒ name") and how the query is read (must / never / any of).
- **The Search page** (`#/search?q=&in=`) searches the whole library (or a folder, `in=`). Its first tab, **All**, shows the first few results of each kind — Images, Albums, Racks & drawers, Tags (and Collections from milestone 6) — each with **See all**, which opens that kind's own tab. Folders and tags are matched by the plain-text words of the query; images by the full syntax, with the tag index on the side.
- **Implications apply to existing images**: adding or removing one re-computes the implied tags of every image carrying the tag. When that touches more than **30 images**, the app asks first, with the count.
- **Ctrl + click on a tag** opens its wiki page (milestone 5); middle-click opens it in a new tab.
- **Deleting a tag** removes it from every image, after a plain confirmation showing how many images use it.

### 11.3 Group by collection

With `group=collection`, the same filtered set is joined with collection membership, so an image in two collections yields two rows and images in none yield one row with a null collection:

```sql
SELECT f.*, c.id AS collection_id, c.name AS collection_name, ci.position
FROM files f
LEFT JOIN collection_items ci ON ci.file_id = f.id
LEFT JOIN collections c       ON c.id = ci.collection_id
WHERE /* same conditions as 11.2 */
ORDER BY c.name IS NULL, c.name COLLATE NOCASE, ci.position :dir, f.filename;
```

`:dir` is the in-collection order (ascending by default, reversible). The client renders a section header whenever `collection_id` changes; paging works unchanged because the order is total.

---

## 12. API

JSON over HTTP, all under `/api`. Ids everywhere. Errors are `{ "error": { "code": "…", "message": "…" } }` with a proper status. The Hono app type is exported so the frontend client is fully typed.

### 12.1 Library

| Method | Path                        | Purpose                                   |
|--------|-----------------------------|-------------------------------------------|
| GET    | `/api/library`              | Open library info, stats, scan status     |
| POST   | `/api/library/open`         | Open a folder as library `{ path }`       |
| POST   | `/api/library/create`       | Create a library `{ path }`               |
| GET    | `/api/library/recent`       | Recent libraries                          |
| POST   | `/api/library/rescan`       | Full reconciliation                       |

### 12.2 Folders

| Method | Path                            | Purpose                                                  |
|--------|---------------------------------|----------------------------------------------------------|
| GET    | `/api/folders`                  | Library page: `{ front: { inbox, categories } }` with counts & covers |
| GET    | `/api/folders?parent=:id`       | `{ children }`: sub-categories and albums, a→z, with counts & covers |
| GET    | `/api/folders?q=`               | Search folders by name, any depth (Search page, Folders tab) |
| GET    | `/api/folders/:id`              | Folder + breadcrumb ancestors                            |
| POST   | `/api/folders`                  | Create `{ parentId, kind, name }`                        |
| GET    | `/api/folders/tree`             | Every folder, flat (folder picker)                       |
| PATCH  | `/api/folders/:id`              | `{ name?, description?, coverFileId? }`                  |
| POST   | `/api/folders/:id/recycle`      | Recycle (refused while it holds starred images)          |
| POST   | `/api/folders/:id/move`         | Move `{ parentId }`                                      |
| POST   | `/api/folders/:id/recycle`      | Send to Recycle Bin                                      |

### 12.3 Files

| Method | Path                           | Purpose                                                    |
|--------|--------------------------------|------------------------------------------------------------|
| GET    | `/api/files`                   | Query: `q, folder, recursive, favorites, name, collection, sort, order, group, seed, offset, limit` (≤ 500, default 200) → `{ items, total }` |
| GET    | `/api/files/ids`               | Same filters → every id in order (Select all)              |
| GET    | `/api/files/locate`            | Same filters + `id` → `{ position: { index, total } }` (viewer prev / next) |
| POST   | `/api/files/favorite`          | Bulk `{ ids, favorited }`                                  |
| GET    | `/api/files/:id`               | Details: metadata, tags (with source), collections         |
| PATCH  | `/api/files/:id`               | `{ name?, description?, favorited? }`                      |
| POST   | `/api/files/brief`             | `{ ids }` → name, star and folder of each (actions on a selection) |
| GET    | `/api/files/names?folder=`     | Lowercase file names in a folder (clash previews)          |
| POST   | `/api/files/move`              | `{ ids, folderId, policy }` → counts, renamed, skipped, `undo` |
| POST   | `/api/files/undo-move`         | `{ items: undo }`                                          |
| POST   | `/api/files/copy`              | `{ ids, folderId, policy }` (`copyTags` with milestone 4)  |
| POST   | `/api/files/rename-bulk`       | `{ ids, pattern, start, digits }`                          |
| POST   | `/api/files/recycle`           | `{ ids }`                                                  |
| POST   | `/api/files/import`            | `{ folderId?, path }` — one file from the picker; no folder → Inbox |
| POST   | `/api/files/upload?folderId=&name=` | One dropped file as the raw body; no folder → Inbox  |
| POST   | `/api/files/import-done`       | Import summary for the log                                 |
| POST   | `/api/files/tags`              | Bulk `{ ids, add: [...], remove: [...] }`                  |
| PUT    | `/api/files/:id/tags`          | Replace manual tags `{ tags: [...] }`                      |
| GET    | `/api/files/random`            | Same filters as the list, plus `exclude`                   |

### 12.4 Tags

| Method | Path                                  | Purpose                                             |
|--------|---------------------------------------|-----------------------------------------------------|
| GET    | `/api/tags`                           | List: `q` (name or alias contains), `type`, `sort` (name / count), `limit` — with counts and aliases |
| GET    | `/api/tags/suggest?q=&limit=`         | Autocomplete: names and aliases, prefix first then by count; `type:` narrows; reports the matched alias |
| GET    | `/api/tags/resolve?names=`            | Batch resolve wiki links (comma-separated `type:name` or `name`, aliases count) → `{ tags: { [ref]: TagRef | null } }` |
| GET    | `/api/tags/:id`                       | Tag, aliases, implies / implied by, cover, count, description |
| GET    | `/api/tags/:id/page`                  | Wiki page: the tag plus `updatedAt`, the type's `fields`, the tag's field `values`, `related` (top 12) and `preview` (7 newest images) |
| PUT    | `/api/tags/:id/page`                  | Save the page in one transaction: `{ description?, coverFileId?, fields?: { [fieldId]: { value? | fileId? | tagIds? } } }` — all or nothing |
| GET    | `/api/tags/:id/type-change?typeId=`   | Field values a type change would lose → `{ lost: [{ fieldId, label, value }] }` |
| POST   | `/api/tags`                           | Create `{ name, typeId? }` (`type:name` works)       |
| PATCH  | `/api/tags/:id`                       | `{ name?, typeId?, coverFileId? }` — a type change moves field values by key and kind |
| POST   | `/api/tags/delete`                    | Delete `{ ids }` — they come off every image        |
| POST   | `/api/tags/merge`                     | `{ sourceIds, targetId, keepAliases }`              |
| POST   | `/api/tags/:id/aliases`               | Add alias `{ alias }`                               |
| POST   | `/api/tags/:id/aliases/remove`        | Remove alias `{ alias }`                            |
| POST   | `/api/tags/:id/aliases/main`          | Make an alias the main name `{ alias }`             |
| GET    | `/api/tags/:id/implications/impact`   | `?implied=&action=add|remove` → images it would touch (the app asks above 30) |
| POST   | `/api/tags/:id/implications`          | `{ impliedId }` (loops refused; applied to existing images) |
| POST   | `/api/tags/:id/implications/remove`   | `{ impliedId }`                                     |
| GET    | `/api/files/tag-counts`               | Same filters as the file list → top 100 tags in the results, plus the tags the query names |
| POST   | `/api/files/tags`                     | `{ ids, add, remove }` tag ids; implied tags follow  |
| POST   | `/api/files/tag-coverage`             | `{ ids }` → each tag on any of them, on how many (bulk tag dialog) |
| GET    | `/api/folders/search?q=`              | Folders by name, with their path (Search page)     |

### 12.5 Tag types

| Method | Path                                   | Purpose                                     |
|--------|----------------------------------------|---------------------------------------------|
| GET    | `/api/tag-types`                       | `{ types, fields }` — every type, and every custom field with how many tags filled it in |
| POST   | `/api/tag-types`                       | Create `{ name, color }`                    |
| PATCH  | `/api/tag-types/:id`                   | `{ name?, color?, isDefault? }` — the key follows the name (`body_parts`) |
| POST   | `/api/tag-types/:id/move`              | `{ delta: -1 | 1 }` reorder                   |
| DELETE | `/api/tag-types/:id`                   | Delete (only if it has no tags and isn't the default) |
| POST   | `/api/tag-types/:id/fields`            | Add field `{ label, kind, options? }` (the key comes from the label and never changes) |
| PATCH  | `/api/tag-fields/:id`                  | `{ label?, options? }` — values that no longer fit the options are dropped |
| POST   | `/api/tag-fields/:id/move`             | `{ delta: -1 | 1 }` reorder                  |
| GET    | `/api/tag-fields/:id/kind-costs`       | For each kind, how many values switching to it would clear |
| POST   | `/api/tag-fields/:id/kind`             | `{ kind, clearLost }` — refused (409) while values would be lost and `clearLost` is false |
| DELETE | `/api/tag-fields/:id`                  | Delete field (and its values)               |

### 12.6 Collections

| Method | Path                                  | Purpose                                 |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/api/collections`                    | List with counts and covers; `q` filters by name |
| POST   | `/api/collections`                    | Create                                  |
| GET    | `/api/collections/:id`                | Collection info (items via `/api/files?collection=`) |
| PATCH  | `/api/collections/:id`                | Name, description, cover                |
| DELETE | `/api/collections/:id`                | Delete (files untouched)                |
| POST   | `/api/collections/:id/items`          | Add `{ ids, position? }`                |
| DELETE | `/api/collections/:id/items`          | Remove `{ ids }`                        |
| PUT    | `/api/collections/:id/order`          | Full new order `{ ids }`                |

### 12.7 Health, recycle, system

| Method | Path                               | Purpose                                         |
|--------|------------------------------------|-------------------------------------------------|
| GET    | `/api/health`                      | Issues grouped by severity and kind             |
| GET    | `/api/health/summary`              | Counts per severity (top-bar indicator)         |
| GET    | `/api/health/logs`                 | Log folder size and file count                  |
| DELETE | `/api/health/logs`                 | Clear logs                                      |
| POST   | `/api/health/:id/fix`              | Apply a fix `{ action, params }`                |
| POST   | `/api/health/fix-all`              | Apply the suggested fix to all issues of a kind |
| GET    | `/api/recycle`                     | Recycled items                                  |
| POST   | `/api/recycle/:id/restore`         | Restore `{ targetFolderId? }`                   |
| POST   | `/api/recycle/delete`              | Delete permanently `{ ids }`                    |
| DELETE | `/api/recycle`                     | Empty the bin                                   |
| POST   | `/api/system/open-with`            | Windows "Open with" dialog for a file id        |
| POST   | `/api/system/pick-files`           | Windows file picker → paths                     |
| POST   | `/api/system/pick-folder`          | Folder picker (open/create library)             |
| POST   | `/api/system/open-logs`            | Open the logs folder in Explorer                |
| GET    | `/api/system/about`                | Version, release date, credits, formats per module |
| GET    | `/api/events`                      | Server-sent events: scan progress, file changes, thumbnail ready |

The `system/*` pickers use PowerShell dialogs as in the MVP; in Electron they become native dialogs (§14).

---

## 13. Frontend

### 13.1 Routes

Hash-based routing (`#/…`), so the same build works from `http://localhost` and from Electron's `file://`/custom protocol. A small in-house router (~100 lines) maps patterns to page components.

| Route                    | Page                                      |
|--------------------------|-------------------------------------------|
| `#/`                     | Hub                                       |
| `#/images`               | Library (categories)                      |
| `#/images/f/:id`         | Folder page (category / sub-category)     |
| `#/images/a/:id`         | Album page                                |
| `#/images/f/:id/all`     | View all images under a folder            |
| `#/images/v/:fileId`     | Image viewer; the list it steps through is in the query (`?folder&recursive&sort&order&seed&…`), so it survives a reload |
| `#/search?q=&tab=`       | Search (tabs: all, images, albums, folders, tags) |
| `#/tags`                 | Tags directory                            |
| `#/tags/:id`             | Tag wiki page (view, and its Edit page mode) |
| `#/tags/:id/images`      | Tag gallery (all images with the tag)     |
| `#/tag-types?tab=`       | Tag types; `tab=fields` opens Custom fields |
| `#/collections`          | Collections                               |
| `#/collections/:id`      | Collection page                           |
| `#/favorites`            | Favorites — a view of every starred image (not a folder); linked from the top bar and the Library page |
| `#/health`               | Library Health                            |
| `#/recycle`              | Recycle Bin                               |
| `#/settings`             | Settings                                  |

### 13.2 Key components

- `MediaGrid` — virtualized grid (only visible rows are in the DOM), infinite paging against `/api/files`, selection model (click / Ctrl / Shift / select all), reports visible ids for thumbnail priority. Used by album, all-images, search, tag gallery, collection, favorites.
- `FolderCard`, `CollectionCard` — kind-specific visuals (rack / drawer / album) per the user guide.
- `Breadcrumbs`, `TopBar`, `TagSidebar`, `ContextMenu`, `FolderPicker` (modal tree for move/copy).
- `TagInput` — autocomplete with type colors, counts and alias resolution; shows implied tags as locked chips. When nothing matches, offers *Create "…" as [type ▾]*; a `type:` prefix preselects the type.
- `TagChip` — colored by type, tooltip from description. Rendered as a real link to the tag's gallery, so the uniform interactions come for free: click → gallery, Ctrl+click → wiki (handled), middle-click → browser opens the wiki href in a new tab (`data-wiki-href`), right-click → tag context menu. In the sidebar a `mode="filter"` variant replaces click with the include → exclude → off cycle and Ctrl+click with the any-of toggle.
- `HealthIndicator` — top-bar badge fed by `/api/health/summary` and `/api/events`.
- `HelpDialog` — tabs *This page*, *Shortcuts*, *Formats*, *About* (§13.5).
- `ThemePicker` — panel of mini previews (§13.4); shown once more than one theme exists.
- `CheckStylesDialog` — tabs with the style mockups in sandboxed iframes (§13.4).
- `DropZone` — page-level and per-album-card drop targets, upload progress, per-file error report.
- `CoverMenu` — the *Set as cover of ▸* submenu: ancestors of the file (from the breadcrumb), the current collection (if any) and the file's tags.
- `WikiArticle` / `WikiEditor` — Markdown (marked, sanitized with DOMPurify) with a `[[type:name|label]]` inline extension; links resolve in one `/api/tags/resolve` call per page and are cached until tags change. The editor has a toolbar, Edit / Split / Preview (remembered per browser) and `[[` suggestions.
- `FieldEditor` — one editor per custom field kind; client-side checks share `shared/field-values.ts` with the server. `ImagePickerDialog` — the tag's images, then the whole library. `CustomFields` — the Tag types tab. `CreateLinkedTagDialog` — creates the tag of a missing link.
- `TagTooltip` — one hover card for every `TagChip`: type, name, first paragraph of the description (about 200 characters), count; details fetched on hover and cached for 30 s.
- `Viewer` — zoom/pan/slideshow ported from the MVP; receives a *navigation context* (the query that produced the list) so prev/next page through the server instead of relying on sessionStorage.

### 13.3 State

Svelte 5 runes. Server data is fetched per page through the typed `hc` client; a small cache keyed by request avoids refetching on back-navigation. Global state is limited to: current library, tag types (with fields), theme, selection. Live updates (`/api/events`) invalidate the affected caches.

### 13.4 Themes

Themes are **data**, not stylesheets: each is a `web/src/themes/<id>.ts` exporting `{ id, name, description, vars: { '--bg': …, '--surface': …, '--accent': …, … } }`. Applying a theme writes its `vars` onto `:root`; all component CSS uses only the variables. **v1 ships one theme, Darkroom** (from `docs/Styles and themes/`). The MVP's four themes are not ported; how styles, variants and module-specific themes evolve is in `docs/styles.md`.

**Check styles.** A dialog (from Settings and the theme button) shows the other style mockups — Mochi, Scriptorium, Sticker Riot — as-is, one tab each, in `<iframe sandbox="allow-scripts">`. The mockups are copied unchanged to `web/public/styles/`; they're self-contained (React is inlined in each file), so they work offline. They are for showing and comparing only; they don't change the app.

When more themes exist, this makes the **theme picker** cheap: each preview card is a miniature mock layout (top bar, a few cards, a chip) rendered with the theme's `vars` scoped to the card, and the hovered theme's `description` is shown in the panel's footer. It's also the foundation for user-made themes later (same shape, stored in the library DB).

Tag type colors come from the DB and are applied as inline custom properties so they work in every theme; text on colored chips picks black or white by contrast.

### 13.5 Help and shortcuts

- **Keymap registry.** Every page registers its shortcuts in one place (`keymap.ts`: key, description, handler, scope). The same registry dispatches key events *and* produces the *Shortcuts* tab, so help can never drift from behaviour. `F1` and the `?` button open the dialog on every page.
- **This page** content lives in `web/src/help/<page>.md` (one Markdown file per route), rendered with the same Markdown pipeline as the wiki. Its text is kept in sync with the corresponding user guide section.
- **About** comes from `/api/system/about`: version from `package.json`, release date injected at build time, credits (*Felipe, with Claude*), and the supported formats per module.

---

## 14. Toward Electron

The design keeps the door open:

- The Hono server can run inside Electron's main process (or a utility process) unchanged; the window loads `http://127.0.0.1:<port>` — no frontend changes.
- `better-sqlite3` and `sharp` must be rebuilt for Electron's Node ABI (`@electron/rebuild`).
- `system/*` endpoints get Electron implementations (`dialog.showOpenDialog`, `shell.openPath`) behind the same service interface; the PowerShell versions remain for the browser mode.
- The app config moves to Electron's `app.getPath('userData')`.

---

## 15. Security (local-only still matters)

- Bind to `127.0.0.1`; reject requests whose `Host` isn't `localhost`/`127.0.0.1` (DNS-rebinding protection) and whose `Origin` isn't the app's own.
- Every path is derived from DB ids and checked to be inside the library root. The only client-supplied paths are library locations and file-picker results, validated before use.
- Markdown is sanitized; SVGs are sandboxed (§8.5).
- The `open-with` helper passes the path as an argument, never through string-built shell commands.

---

## 16. Carried over from the MVP

Ported (rewritten in TypeScript/Svelte, same behaviour): image viewer zoom/pan/slideshow logic, keyboard handling, thumbnail generation settings, PowerShell file picker and "Open with", context-menu system, recycle-bin concept, organize → now Library Health.

Not carried over: `category/filename` identity, lazy file rows, client-side filtering of full lists, sessionStorage navigation, legacy JSON seeding, and the `loose-images/`, `gifs/`, `loose-files/` holding folders and the `/loose` drop folder — all replaced by the single Inbox.

---

## 17. Testing

- **Services** are tested with Vitest against temporary libraries created in the OS temp folder: build a folder tree, run reconciliation, assert DB state.
- Must-have scenarios: rename/move folders and files outside the app; delete and restore; unmarked folders; duplicate detection; implication chains and cycle rejection; merge; alias collisions; search parser (table-driven); rel_path rewrite on folder move.
- The frontend gets component tests for `TagInput`, the search-box highlighter and `MediaGrid` selection; the rest is verified by using the app.

---

## 18. Implementation milestones

1. **Skeleton** — workspaces, Hono + Svelte wired, config, create/open library, migrations, logging, Darkroom theme and Check styles dialog, keymap registry and Help dialog shell.
2. **Folders & files** — reconciliation, markers, Inbox, hashing, thumbnails, Library / Folder / Album pages, viewer. *(Done; design `docs/Design/darkroom-milestone-2-pages/`.)*
3. **File operations** — import (picker and drag and drop), move, copy, rename, covers, recycle bin, watcher. *(Done: see §7.5, §8.3–8.6; design `docs/Design/darkroom-milestone-3-pages/`.)*
4. **Tags** *(done)* — types, tags, tag input, tag chips and sidebar, search syntax (include / exclude / any of), aliases and main name, implications, merge; the Search page, tag galleries, the Tags directory, the Tag types page (without custom fields) and an **Edit tag** dialog for name, type, aliases, implications, merge and delete. Design: `docs/Design/darkroom-milestone-4-pages/`.
5. **Wiki** *(done)* — tag pages, descriptions, custom fields, related tags. Editing moves onto the wiki page; the Edit tag dialog stays as a shortcut. Design: `docs/Design/darkroom-milestone-5-pages/`. Decisions: one **Edit page** mode for the whole page (description, fields, cover) with Save / Discard; descriptions up to 20,000 characters; changing a tag's type lists exactly which field values would be lost before confirming; Ctrl + click and middle-click on a tag open its wiki page; **Related tags** shows the top 12.
6. **Collections** — collection pages, viewer navigation, bulk add, group by collection.
7. **Library Health** — all issue kinds and fixes, severity indicator, external-move keep/undo, logs section.
8. **Polish** — favorites, random, settings, per-page help content, performance pass at 50k images.

---

## 19. Open points

- **Styles** — final theme model (style × variant, mapping of old themes, module-specific themes): see `docs/styles.md`.
- **Search and Download** — planned after the Videos and Audio modules: see `docs/search-and-download.md`.
- **Search tabs** — Folders and Collections tabs use `GET /api/folders?q=` and `GET /api/collections?q=`; no per-tab counts.

- **Keyboard shortcuts** — decided: the MVP set plus `S` (slideshow), `T` (type a tag; `Esc` leaves the field), `/` (search) and `F1` (help); `Esc` keeps the MVP order (fullscreen → slideshow → tags panel → slideshow panel). See user guide §3.4 and §4.5. The Help dialog's *Shortcuts* tab lists them from the keymap registry, so it never drifts.
- **Hash algorithm** — decided: SHA-256. Revisit (e.g. xxHash via a bundled WASM build) only if first imports of very large libraries prove slow.
- **Thumbnail size** — decided: 400 px.
- **Tag name rules** — decided: names are shown with spaces as typed; `_` and space are equivalent when matching, and search writes them with `_` (§10.1).
