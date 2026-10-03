import { randomUUID } from 'node:crypto';
import { isImageFile, type FolderKind } from '@media-view/shared';
import type { DB } from '../db/connection.ts';
import { hashFile } from '../lib/hash.ts';
import { log } from '../lib/log.ts';
import { writeMarker } from '../lib/markers.ts';
import { baseName, extension, parentPath, toAbsolute, underPrefix } from '../lib/paths.ts';
import { walk, type DiskDir, type DiskFile } from '../lib/walk.ts';
import { clearIssue, getIssuePayload, IssueSweep, raiseIssue, type IssueKind } from './issues.ts';
import { ensureInbox, type OpenLibrary } from './library.ts';

/**
 * Reconciliation: compare the Images module root with the DB (technical doc §7.2).
 * The DB follows what can be proven (moves and renames through markers or hashes, metadata
 * refreshes); every change made outside the app is also recorded as an issue. Nothing is deleted.
 */

export interface ReconcileResult {
  foldersAdded: number;
  foldersMoved: number;
  foldersMissing: number;
  filesAdded: number;
  filesChanged: number;
  filesMoved: number;
  filesMissing: number;
  durationMs: number;
}

interface FolderRow {
  id: number;
  uuid: string;
  parent_id: number | null;
  kind: FolderKind;
  name: string;
  rel_path: string;
  missing_since: number | null;
}

interface FileRow {
  id: number;
  folder_id: number;
  category_id: number;
  filename: string;
  rel_path: string;
  size: number;
  mtime: number;
  hash: string | null;
  missing_since: number | null;
}

/** Issue kinds a full scan recomputes from scratch. The others are events that wait for the user. */
const STATE_KINDS: IssueKind[] = ['missing_folder', 'missing_file', 'loose_files', 'nested_in_album', 'wrong_type'];

/** Files Windows (or other tools) drop into folders; never reported as wrong types. */
const IGNORED_FILES = new Set(['desktop.ini', 'thumbs.db', 'ehthumbs.db']);

const HASH_CONCURRENCY = 4;

/** Case-insensitive key, matching the DB's NOCASE collation. */
const key = (relPath: string) => relPath.toLowerCase();
const depth = (relPath: string) => relPath.split('/').length;

export async function reconcile(lib: OpenLibrary): Promise<ReconcileResult> {
  const started = Date.now();
  const { db } = lib;
  const root = lib.moduleRoot('images');
  const result: ReconcileResult = {
    foldersAdded: 0, foldersMoved: 0, foldersMissing: 0,
    filesAdded: 0, filesChanged: 0, filesMoved: 0, filesMissing: 0, durationMs: 0,
  };

  ensureInbox(lib);

  // Pass 1 — walk the disk.
  const snapshot = await walk(root);
  // Unreadable images (`wrong_type` on `file:<id>`) are found by the thumbnailer, not by the scan.
  const sweep = new IssueSweep(db, STATE_KINDS, (kind, subject) => kind === 'wrong_type' && subject.startsWith('file:'));

  // Pass 2 — match folders.
  const resolved = db.transaction(() => matchFolders(lib, snapshot.dirs, snapshot.files, sweep, result))();

  // Pass 3 — match files. Hashing (async) happens between planning and applying.
  const plan = planFiles(db, snapshot.files, resolved);
  await hashCandidates(root, plan);
  db.transaction(() => {
    applyFiles(db, plan, resolved, sweep, result);
    // Pass 4 — rules.
    checkRules(snapshot.files, resolved, sweep);
    sweep.finish();
  })();

  result.durationMs = Date.now() - started;
  log('info', 'scan', 'reconciliation finished', result);
  return result;
}

// ─── Pass 2: folders ─────────────────────────────────────────────────────────

function matchFolders(
  lib: OpenLibrary,
  dirs: DiskDir[],
  files: DiskFile[],
  sweep: IssueSweep,
  result: ReconcileResult,
): Map<string, FolderRow> {
  const { db } = lib;
  const libraryId = lib.meta.id;
  const rows = db.prepare(
    "SELECT id, uuid, parent_id, kind, name, rel_path, missing_since FROM folders WHERE module = 'images'",
  ).all() as FolderRow[];
  const byUuid = new Map(rows.map((r) => [r.uuid, r]));
  const byPath = new Map(rows.map((r) => [key(r.rel_path), r]));
  const recycled = new Set(db.prepare("SELECT entity_id FROM recycle_items WHERE entity = 'folder'").pluck().all() as number[]);

  // What each directory directly contains, for kind inference.
  const childDirs = new Map<string, number>();
  for (const d of dirs) {
    const p = key(parentPath(d.relPath));
    childDirs.set(p, (childDirs.get(p) ?? 0) + 1);
  }
  const directImages = new Map<string, number>();
  for (const f of files) {
    if (!isImageFile(f.relPath)) continue;
    const p = key(parentPath(f.relPath));
    directImages.set(p, (directImages.get(p) ?? 0) + 1);
  }

  const sorted = [...dirs].sort((a, b) => depth(a.relPath) - depth(b.relPath) || a.relPath.localeCompare(b.relPath));

  // Phase A — assign DB rows to directories: marker identity first, then path.
  // A marker that appears in several directories (a folder copied in Explorer) identifies only one
  // of them: the one at the DB's path if present, otherwise the first one found.
  const assigned = new Map<string, FolderRow>();
  const restoredUuid = new Map<string, string>();
  const claimed = new Set<number>();
  const markerOwner = new Map<string, string>();
  for (const d of sorted) {
    const m = d.marker;
    if (!m || m.library !== libraryId) continue;
    const current = markerOwner.get(m.folder);
    const row = byUuid.get(m.folder);
    if (current === undefined || (row && key(row.rel_path) === key(d.relPath))) markerOwner.set(m.folder, d.relPath);
  }
  for (const d of sorted) {
    const m = d.marker;
    if (!m || m.library !== libraryId || markerOwner.get(m.folder) !== d.relPath) continue;
    const row = byUuid.get(m.folder);
    if (row) {
      assigned.set(key(d.relPath), row);
      claimed.add(row.id);
    } else {
      restoredUuid.set(key(d.relPath), m.folder); // known library, unknown folder: the DB lost it
    }
  }
  for (const d of sorted) {
    const k = key(d.relPath);
    if (assigned.has(k) || restoredUuid.has(k)) continue;
    const row = byPath.get(k);
    if (row && !claimed.has(row.id)) {
      assigned.set(k, row);
      claimed.add(row.id);
    }
  }

  // Phase B — apply, parents before children.
  const resolved = new Map<string, FolderRow>();
  const blocked = new Set<string>();
  const now = Date.now();

  for (const d of sorted) {
    const k = key(d.relPath);
    const parentRel = parentPath(d.relPath);
    const parent = parentRel ? resolved.get(key(parentRel)) : undefined;

    if (parentRel && (blocked.has(key(parentRel)) || !parent)) {
      blocked.add(k);
      continue;
    }
    if (parent && (parent.kind === 'album' || parent.kind === 'inbox')) {
      sweep.raise('nested_in_album', `path:${d.relPath}`, { path: d.relPath, albumId: parent.id });
      blocked.add(k);
      continue;
    }

    try {
      db.transaction(() => {
        const row = assigned.get(k);
        const folder = row
          ? updateKnownFolder(lib, row, d, parent ?? null, rows, result)
          : insertNewFolder(lib, d, parent ?? null, restoredUuid.get(k), childDirs.get(k) ?? 0, directImages.get(k) ?? 0, now, result);
        resolved.set(k, folder);
      })();
    } catch (err) {
      log('error', 'scan', 'could not reconcile folder', { path: d.relPath, message: (err as Error).message });
      blocked.add(k);
    }
  }

  // DB folders not matched by any directory are missing (the Inbox is always recreated instead).
  const seen = new Set([...resolved.values()].map((r) => r.id));
  for (const r of rows) {
    if (seen.has(r.id) || r.kind === 'inbox' || recycled.has(r.id)) continue;
    if (r.missing_since === null) {
      db.prepare('UPDATE folders SET missing_since = ? WHERE id = ?').run(now, r.id);
      result.foldersMissing++;
    }
    sweep.raise('missing_folder', `folder:${r.id}`, { path: r.rel_path, kind: r.kind, name: r.name });
  }

  return resolved;
}

/** The kind a folder must have at this position: top level → category, nested category → sub-category. */
function positionalKind(kind: FolderKind, parent: FolderRow | null, relPath: string): FolderKind {
  if (!parent) return kind === 'inbox' && relPath === 'Inbox' ? 'inbox' : 'category';
  if (kind === 'category' || kind === 'inbox') return 'subcategory';
  return kind;
}

function updateKnownFolder(
  lib: OpenLibrary,
  row: FolderRow,
  d: DiskDir,
  parent: FolderRow | null,
  allRows: FolderRow[],
  result: ReconcileResult,
): FolderRow {
  const { db } = lib;
  const kind = positionalKind(row.kind, parent, d.relPath);
  const moved = row.rel_path !== d.relPath;
  const oldPath = row.rel_path;

  if (moved) {
    // Rewrite the paths of everything under the folder, in the DB and in memory.
    const newPrefix = d.relPath;
    const under = underPrefix('rel_path', oldPath);
    db.prepare(
      `UPDATE folders SET rel_path = ? || substr(rel_path, ?) WHERE module = 'images' AND ${under.sql}`,
    ).run(newPrefix, oldPath.length + 1, ...under.params);
    db.prepare(
      `UPDATE files SET rel_path = ? || substr(rel_path, ?) WHERE media_type = 'image' AND ${under.sql}`,
    ).run(newPrefix, oldPath.length + 1, ...under.params);
    const lowerOld = key(oldPath) + '/';
    for (const other of allRows) {
      if (key(other.rel_path).startsWith(lowerOld)) other.rel_path = newPrefix + other.rel_path.slice(oldPath.length);
    }
    result.foldersMoved++;

    // Keep the original location if the folder moves again before the user reviews it.
    const subject = `folder:${row.id}`;
    const previous = getIssuePayload<{ from: string }>(db, 'external_move', subject);
    const from = previous?.from ?? oldPath;
    if (key(from) === key(d.relPath)) clearIssue(db, 'external_move', subject);
    else raiseIssue(db, 'external_move', subject, { entity: 'folder', folderId: row.id, from, to: d.relPath });
  }

  const name = baseName(d.relPath);
  db.prepare(
    `UPDATE folders SET rel_path = ?, name = ?, parent_id = ?, kind = ?, missing_since = NULL,
       updated_at = CASE WHEN ? THEN ? ELSE updated_at END WHERE id = ?`,
  ).run(d.relPath, name, parent?.id ?? null, kind, moved || kind !== row.kind ? 1 : 0, Date.now(), row.id);

  const m = d.marker;
  if (!m || m.folder !== row.uuid || m.kind !== kind || m.library !== lib.meta.id) {
    writeMarker(toAbsolute(lib.moduleRoot('images'), d.relPath), kind, lib.meta.id, row.uuid);
  }

  Object.assign(row, { rel_path: d.relPath, name, parent_id: parent?.id ?? null, kind, missing_since: null });
  return row;
}

function insertNewFolder(
  lib: OpenLibrary,
  d: DiskDir,
  parent: FolderRow | null,
  restoredUuid: string | undefined,
  childDirCount: number,
  directImageCount: number,
  now: number,
  result: ReconcileResult,
): FolderRow {
  const { db } = lib;
  // A known-library marker whose folder the DB lost: rebuild it with its own identity and kind.
  const restoredKind = restoredUuid ? d.marker?.kind : undefined;
  const inferred = inferKind(childDirCount, directImageCount);
  const kind = positionalKind(restoredKind ?? inferred.kind, parent, d.relPath);
  const uuid = restoredUuid ?? randomUUID();
  const name = baseName(d.relPath);

  const id = db.prepare(
    `INSERT INTO folders (uuid, module, parent_id, kind, name, rel_path, created_at, updated_at)
     VALUES (?, 'images', ?, ?, ?, ?, ?, ?)`,
  ).run(uuid, parent?.id ?? null, kind, name, d.relPath, now, now).lastInsertRowid as number;
  writeMarker(toAbsolute(lib.moduleRoot('images'), d.relPath), kind, lib.meta.id, uuid);

  if (!restoredUuid) {
    // Registered right away so its images are visible; the kind still waits for confirmation.
    raiseIssue(db, 'unmarked_folder', `folder:${id}`, { folderId: id, path: d.relPath, inferred: kind, certain: inferred.certain });
  }
  result.foldersAdded++;
  return { id, uuid, parent_id: parent?.id ?? null, kind, name, rel_path: d.relPath, missing_since: null };
}

/** Folders with images and no folders → album; folders with folders → sub-category; otherwise a guess. */
function inferKind(childDirs: number, directImages: number): { kind: FolderKind; certain: boolean } {
  if (childDirs > 0) return { kind: 'subcategory', certain: directImages === 0 };
  return { kind: 'album', certain: directImages > 0 };
}

// ─── Pass 3: files ───────────────────────────────────────────────────────────

interface FilePlan {
  rows: FileRow[];
  /** Disk files with a DB row at the same path. */
  present: { disk: DiskFile; row: FileRow }[];
  /** Disk files with no row at their path. */
  fresh: { disk: DiskFile; hash: string | null; needsHash: boolean }[];
  /** Rows whose file isn't at its path any more: move candidates, by size. */
  vanishedBySize: Map<number, FileRow[]>;
  vanished: FileRow[];
}

function planFiles(db: DB, files: DiskFile[], resolved: Map<string, FolderRow>): FilePlan {
  const rows = db.prepare(
    `SELECT id, folder_id, category_id, filename, rel_path, size, mtime, hash, missing_since
     FROM files WHERE media_type = 'image' AND recycled = 0`,
  ).all() as FileRow[];
  const rowByPath = new Map(rows.map((r) => [key(r.rel_path), r]));

  const images = files.filter((f) => isImageFile(f.relPath) && nearestFolder(f.relPath, resolved));
  const onDisk = new Set(images.map((f) => key(f.relPath)));

  const vanished = rows.filter((r) => !onDisk.has(key(r.rel_path)));
  const vanishedBySize = new Map<number, FileRow[]>();
  for (const r of vanished) {
    if (!r.hash) continue; // can't be matched by content
    vanishedBySize.set(r.size, [...(vanishedBySize.get(r.size) ?? []), r]);
  }

  const present: FilePlan['present'] = [];
  const fresh: FilePlan['fresh'] = [];
  for (const f of images) {
    const row = rowByPath.get(key(f.relPath));
    if (row) present.push({ disk: f, row });
    // Only hash now when a vanished file of the same size could be this one; the rest is hashed later.
    else fresh.push({ disk: f, hash: null, needsHash: vanishedBySize.has(f.size) });
  }
  return { rows, present, fresh, vanishedBySize, vanished };
}

async function hashCandidates(root: string, plan: FilePlan): Promise<void> {
  const todo = plan.fresh.filter((f) => f.needsHash);
  for (let i = 0; i < todo.length; i += HASH_CONCURRENCY) {
    await Promise.all(todo.slice(i, i + HASH_CONCURRENCY).map(async (f) => {
      try {
        f.hash = await hashFile(toAbsolute(root, f.disk.relPath));
      } catch {
        f.hash = null; // vanished meanwhile; treated as new
      }
    }));
  }
}

function applyFiles(db: DB, plan: FilePlan, resolved: Map<string, FolderRow>, sweep: IssueSweep, result: ReconcileResult): void {
  const now = Date.now();
  const placement = (relPath: string) => {
    const folder = nearestFolder(relPath, resolved)!;
    const top = resolved.get(key(relPath.split('/')[0]!))!;
    return { folderId: folder.id, categoryId: top.id };
  };

  const updatePresent = db.prepare(
    `UPDATE files SET rel_path = ?, filename = ?, folder_id = ?, category_id = ?, missing_since = NULL WHERE id = ?`,
  );
  const updateContent = db.prepare(
    'UPDATE files SET size = ?, mtime = ?, hash = NULL, width = NULL, height = NULL WHERE id = ?',
  );
  for (const { disk, row } of plan.present) {
    const { folderId, categoryId } = placement(disk.relPath);
    if (row.rel_path !== disk.relPath || row.folder_id !== folderId || row.category_id !== categoryId || row.missing_since !== null) {
      updatePresent.run(disk.relPath, baseName(disk.relPath), folderId, categoryId, row.id);
    }
    if (row.size !== disk.size || row.mtime !== disk.mtime) {
      // Content changed: tags stay; hash, dimensions and thumbnail are refreshed.
      updateContent.run(disk.size, disk.mtime, row.id);
      result.filesChanged++;
    }
  }

  const insert = db.prepare(
    `INSERT INTO files (media_type, folder_id, category_id, filename, rel_path, ext, size, mtime, hash, added_at)
     VALUES ('image', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const moveRow = db.prepare(
    `UPDATE files SET rel_path = ?, filename = ?, ext = ?, folder_id = ?, category_id = ?, mtime = ?, missing_since = NULL WHERE id = ?`,
  );
  const consumed = new Set<number>();
  const moves = new Map<string, { fromFolderId: number; toFolderId: number; files: { id: number; from: string; to: string }[] }>();

  for (const f of plan.fresh) {
    const { folderId, categoryId } = placement(f.disk.relPath);
    const candidates = f.hash
      ? (plan.vanishedBySize.get(f.disk.size) ?? []).filter((r) => r.hash === f.hash && !consumed.has(r.id))
      : [];

    if (candidates.length === 1) {
      const row = candidates[0]!;
      consumed.add(row.id);
      moveRow.run(f.disk.relPath, baseName(f.disk.relPath), extension(f.disk.relPath), folderId, categoryId, f.disk.mtime, row.id);
      const groupKey = `${row.folder_id}->${folderId}`;
      const group = moves.get(groupKey) ?? { fromFolderId: row.folder_id, toFolderId: folderId, files: [] };
      group.files.push({ id: row.id, from: row.rel_path, to: f.disk.relPath });
      moves.set(groupKey, group);
      result.filesMoved++;
      continue;
    }

    const addedAt = Math.min(f.disk.birthtime || now, now);
    const id = insert.run(
      folderId, categoryId, baseName(f.disk.relPath), f.disk.relPath, extension(f.disk.relPath),
      f.disk.size, f.disk.mtime, f.hash, addedAt,
    ).lastInsertRowid as number;
    result.filesAdded++;

    if (candidates.length > 1) {
      // Identical copies, each with its own metadata: never guess which record this is.
      raiseIssue(db, 'ambiguous_move', `path:${f.disk.relPath}`, {
        fileId: id,
        path: f.disk.relPath,
        candidates: candidates.map((c) => ({ id: c.id, path: c.rel_path })),
      });
    }
  }

  // Moves done outside the app: one issue per (old folder → new folder), merged with earlier ones.
  for (const group of moves.values()) {
    const subject = `files:${group.fromFolderId}->${group.toFolderId}`;
    const previous = getIssuePayload<{ files: { id: number; from: string; to: string }[] }>(db, 'external_move', subject);
    const byId = new Map((previous?.files ?? []).map((x) => [x.id, x]));
    for (const x of group.files) byId.set(x.id, { ...x, from: byId.get(x.id)?.from ?? x.from });
    raiseIssue(db, 'external_move', subject, { entity: 'files', fromFolderId: group.fromFolderId, toFolderId: group.toFolderId, files: [...byId.values()] });
  }

  // Rows whose file is gone: keep everything, mark missing.
  const markMissing = db.prepare('UPDATE files SET missing_since = ? WHERE id = ? AND missing_since IS NULL');
  for (const r of plan.vanished) {
    if (consumed.has(r.id)) continue;
    if (markMissing.run(now, r.id).changes > 0) result.filesMissing++;
    sweep.raise('missing_file', `file:${r.id}`, { fileId: r.id, path: r.rel_path });
  }
}

/** The closest registered folder containing a path, or null (e.g. files directly in Images/). */
function nearestFolder(relPath: string, resolved: Map<string, FolderRow>): FolderRow | null {
  let dir = parentPath(relPath);
  while (dir) {
    const f = resolved.get(key(dir));
    if (f) return f;
    dir = parentPath(dir);
  }
  return null;
}

// ─── Pass 4: rules ───────────────────────────────────────────────────────────

function checkRules(files: DiskFile[], resolved: Map<string, FolderRow>, sweep: IssueSweep): void {
  const loose = new Map<string, string[]>();
  for (const f of files) {
    const name = baseName(f.relPath);
    if (!isImageFile(name)) {
      if (!IGNORED_FILES.has(name.toLowerCase())) sweep.raise('wrong_type', `path:${f.relPath}`, { path: f.relPath, ext: extension(name) });
      continue;
    }
    const dir = parentPath(f.relPath);
    const folder = dir ? resolved.get(key(dir)) : undefined;
    // Images belong in albums (or the Inbox). Directly in Images/, a category or a sub-category, they're loose.
    if (!dir) loose.set('root', [...(loose.get('root') ?? []), f.relPath]);
    else if (folder && (folder.kind === 'category' || folder.kind === 'subcategory')) {
      const subject = `folder:${folder.id}`;
      loose.set(subject, [...(loose.get(subject) ?? []), f.relPath]);
    }
  }
  for (const [subject, paths] of loose) {
    sweep.raise('loose_files', subject, { count: paths.length, paths: paths.slice(0, 50) });
  }
}
