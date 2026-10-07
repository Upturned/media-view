import fs from 'node:fs';
import path from 'node:path';
import type { FolderKind, ThumbRef } from '@media-view/shared';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { expectChange } from '../lib/expected.ts';
import { log } from '../lib/log.ts';
import { writeMarker } from '../lib/markers.ts';
import { splitExt, uniqueName } from '../lib/names.ts';
import { toAbsolute, underPrefix } from '../lib/paths.ts';
import { assertCanHold, kindAt, liveFolder, refreshCategories, thumbRef } from './folders.ts';
import { absPath, BIN_PREFIX, binDir, type OpenLibrary } from './library.ts';
import { rewritePrefix } from './tree.ts';

/**
 * The Recycle Bin (technical doc §8.6; design M3 · 04). Recycling moves the item to
 * `.mediaview/recycle-bin/<id>/<name>` and keeps every row, so restoring is lossless.
 * Starred images are never recycled.
 */

interface RecycleRow {
  id: number;
  /** 'other': a stray file the app doesn't track (a wrong file type), found by its stored name. */
  entity: 'file' | 'folder' | 'other';
  entity_id: number;
  original_rel_path: string;
  original_parent_id: number | null;
  stored_name: string;
  recycled_at: number;
}

const binRel = (recycleId: number, name: string) => `${BIN_PREFIX}/${recycleId}/${name}`;

function moveOnDisk(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  expectChange(from, to);
  fs.renameSync(from, to);
}

// ─── Recycling ───────────────────────────────────────────────────────────────

/** Recycle images; starred ones are left alone and reported back. */
export function recycleFiles(lib: OpenLibrary, ids: number[]): { recycled: number; starred: number[] } {
  const { db } = lib;
  const get = db.prepare('SELECT id, rel_path, filename, folder_id, favorited FROM files WHERE id = ? AND recycled = 0 AND missing_since IS NULL');
  const insert = db.prepare(
    `INSERT INTO recycle_items (entity, entity_id, original_rel_path, original_parent_id, stored_name, recycled_at)
     VALUES ('file', ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare('UPDATE files SET recycled = 1, rel_path = ? WHERE id = ?');
  const result = { recycled: 0, starred: [] as number[] };

  for (const id of ids) {
    const f = get.get(id) as { id: number; rel_path: string; filename: string; folder_id: number; favorited: number } | undefined;
    if (!f) continue;
    if (f.favorited) {
      result.starred.push(f.id);
      continue;
    }
    db.transaction(() => {
      const rid = insert.run(f.id, f.rel_path, f.folder_id, f.filename, Date.now()).lastInsertRowid as number;
      const from = absPath(lib, f.rel_path);
      const to = absPath(lib, binRel(rid, f.filename));
      moveOnDisk(from, to);
      update.run(binRel(rid, f.filename), f.id);
    })();
    result.recycled++;
  }

  if (result.recycled > 0) {
    if (ids.length > 1) log('info', 'files', 'recycle', { ids, recycled: result.recycled, starred: result.starred });
    emit({ type: 'files-changed' });
    emit({ type: 'folders-changed' });
  }
  return result;
}

/** Recycle a stray file the app doesn't track (Library Health's "wrong file types"), restorable like the rest. */
export function recycleStray(lib: OpenLibrary, relPath: string): void {
  const { db } = lib;
  const from = toAbsolute(lib.moduleRoot('images'), relPath);
  if (!fs.existsSync(from)) throw notFound('FILE_NOT_FOUND', 'This file is no longer there.');
  const name = path.basename(from);
  db.transaction(() => {
    const rid = db.prepare(
      `INSERT INTO recycle_items (entity, entity_id, original_rel_path, original_parent_id, stored_name, recycled_at)
       VALUES ('other', 0, ?, NULL, ?, ?)`,
    ).run(relPath, name, Date.now()).lastInsertRowid as number;
    moveOnDisk(from, absPath(lib, binRel(rid, name)));
  })();
  log('info', 'recycle', 'stray file recycled', { path: relPath });
}

/** Recycle a folder with everything in it. Refused while it holds starred images. */
export function recycleFolder(lib: OpenLibrary, id: number): void {
  const { db } = lib;
  const f = liveFolder(lib, id);
  if (f.kind === 'inbox') throw badRequest('INBOX_FIXED', "The Inbox can't be recycled.");
  const under = underPrefix('rel_path', f.rel_path);
  const starred = db.prepare(`SELECT COUNT(*) FROM files WHERE favorited = 1 AND recycled = 0 AND ${under.sql}`).pluck().get(...under.params) as number;
  if (starred > 0) {
    throw conflict('STARRED_INSIDE', `“${f.name}” contains ${starred} starred ${starred === 1 ? 'image' : 'images'} — unstar ${starred === 1 ? 'it' : 'them'} first.`);
  }

  db.transaction(() => {
    const rid = db.prepare(
      `INSERT INTO recycle_items (entity, entity_id, original_rel_path, original_parent_id, stored_name, recycled_at)
       VALUES ('folder', ?, ?, ?, ?, ?)`,
    ).run(f.id, f.rel_path, f.parent_id, f.name, Date.now()).lastInsertRowid as number;
    const target = binRel(rid, f.name);
    moveOnDisk(absPath(lib, f.rel_path), absPath(lib, target));
    db.prepare(`UPDATE files SET recycled = 1 WHERE media_type = 'image' AND ${under.sql}`).run(...under.params);
    db.prepare(`UPDATE folders SET recycled = 1 WHERE module = 'images' AND ${under.sql}`).run(...under.params);
    rewritePrefix(db, f.rel_path, target);
    db.prepare('UPDATE folders SET recycled = 1, rel_path = ? WHERE id = ?').run(target, f.id);
  })();

  log('info', 'folders', 'folder recycled', { id, path: f.rel_path });
  emit({ type: 'folders-changed' });
  emit({ type: 'files-changed' });
}

// ─── The bin ─────────────────────────────────────────────────────────────────

export interface BinItem {
  id: number;
  entity: 'file' | 'folder' | 'other';
  name: string;
  /** Image, the folder's kind, or another kind of file. */
  kind: 'image' | 'other' | FolderKind;
  /** e.g. "2 albums · 58 images" for folders. */
  inner: string | null;
  /** Where it came from, `Fantasy\Elves\Portraits`. */
  location: string;
  /** The original place is gone (missing, recycled, …): it needs "Restore to…". */
  locationGone: boolean;
  recycledAt: number;
  size: number;
  images: number;
  thumb: ThumbRef | null;
}

export function listBin(lib: OpenLibrary): BinItem[] {
  const { db } = lib;
  const rows = db.prepare('SELECT * FROM recycle_items ORDER BY recycled_at DESC, id DESC').all() as RecycleRow[];
  const parentLive = (pid: number | null, needAlbum: boolean): boolean => {
    if (pid === null) return true;
    const p = db.prepare("SELECT kind FROM folders WHERE id = ? AND recycled = 0 AND missing_since IS NULL").pluck().get(pid) as FolderKind | undefined;
    if (!p) return false;
    return needAlbum ? p === 'album' || p === 'inbox' : p === 'category' || p === 'subcategory';
  };

  return rows.map((r) => {
    const parentDir = r.original_rel_path.includes('/') ? r.original_rel_path.slice(0, r.original_rel_path.lastIndexOf('/')) : '';
    const location = parentDir.replaceAll('/', '\\') || 'Images';
    if (r.entity === 'other') {
      let size = 0;
      try {
        size = fs.statSync(absPath(lib, binRel(r.id, r.stored_name))).size;
      } catch {
        // gone from the bin folder
      }
      return {
        id: r.id, entity: 'other', name: r.stored_name, kind: 'other', inner: null, location,
        locationGone: false, recycledAt: r.recycled_at, size, images: 0, thumb: null,
      } satisfies BinItem;
    }
    if (r.entity === 'file') {
      const f = db.prepare('SELECT id, hash, mtime, size FROM files WHERE id = ?').get(r.entity_id) as { id: number; hash: string | null; mtime: number; size: number } | undefined;
      return {
        id: r.id, entity: 'file', name: r.stored_name, kind: 'image', inner: null, location,
        locationGone: !parentLive(r.original_parent_id, true), recycledAt: r.recycled_at,
        size: f?.size ?? 0, images: 1, thumb: f ? thumbRef(f) : null,
      } satisfies BinItem;
    }
    const prefix = binRel(r.id, r.stored_name);
    const under = underPrefix('rel_path', prefix);
    const folder = db.prepare('SELECT kind FROM folders WHERE id = ?').get(r.entity_id) as { kind: FolderKind } | undefined;
    const stats = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS size FROM files WHERE ${under.sql}`).get(...under.params) as { n: number; size: number };
    const kids = db.prepare(`SELECT kind, COUNT(*) AS n FROM folders WHERE ${under.sql} GROUP BY kind`).all(...under.params) as { kind: string; n: number }[];
    const albums = kids.find((k) => k.kind === 'album')?.n ?? 0;
    const first = db.prepare(`SELECT id, hash, mtime FROM files WHERE ${under.sql} ORDER BY rel_path LIMIT 1`).get(...under.params) as { id: number; hash: string | null; mtime: number } | undefined;
    const inner = [albums ? `${albums} ${albums === 1 ? 'album' : 'albums'}` : '', `${stats.n} ${stats.n === 1 ? 'image' : 'images'}`].filter(Boolean).join(' · ');
    return {
      id: r.id, entity: 'folder', name: r.stored_name, kind: folder?.kind ?? 'album', inner, location,
      locationGone: !parentLive(r.original_parent_id, false), recycledAt: r.recycled_at,
      size: stats.size, images: stats.n, thumb: first ? thumbRef(first) : null,
    } satisfies BinItem;
  });
}

function recycleRow(lib: OpenLibrary, id: number): RecycleRow {
  const r = lib.db.prepare('SELECT * FROM recycle_items WHERE id = ?').get(id) as RecycleRow | undefined;
  if (!r) throw notFound('NOT_IN_BIN', 'This item is no longer in the Recycle Bin.');
  return r;
}

function dropBinDir(lib: OpenLibrary, recycleId: number): void {
  fs.rmSync(path.join(binDir(lib), String(recycleId)), { recursive: true, force: true });
}

/**
 * Restore an item to where it came from, or into `targetId` ("Restore to…").
 * A name already taken there keeps both. Returns the folder it landed in.
 */
export function restore(lib: OpenLibrary, recycleId: number, targetId?: number | null): { folderId: number | null } {
  const { db } = lib;
  const r = recycleRow(lib, recycleId);
  const root = lib.moduleRoot('images');

  if (r.entity === 'other') {
    // Back to its old folder on disk (recreated if needed); the next scan reports it again.
    const dir = r.original_rel_path.includes('/') ? r.original_rel_path.slice(0, r.original_rel_path.lastIndexOf('/')) : '';
    const dirAbs = dir ? toAbsolute(root, dir) : root;
    fs.mkdirSync(dirAbs, { recursive: true });
    const { base, ext } = splitExt(r.stored_name);
    moveOnDisk(absPath(lib, binRel(r.id, r.stored_name)), path.join(dirAbs, uniqueName(dirAbs, base, ext)));
    db.prepare('DELETE FROM recycle_items WHERE id = ?').run(r.id);
    dropBinDir(lib, r.id);
    return { folderId: null };
  }

  if (r.entity === 'file') {
    const targetFolder = targetId ?? r.original_parent_id;
    let target;
    try {
      target = targetFolder === null ? null : liveFolder(lib, targetFolder);
    } catch {
      target = null;
    }
    if (!target || (target.kind !== 'album' && target.kind !== 'inbox')) {
      throw conflict('LOCATION_GONE', 'The original album is gone — use Restore to… and pick a new place.');
    }
    const { base, ext } = splitExt(r.stored_name);
    const name = uniqueName(toAbsolute(root, target.rel_path), base, ext);
    const rel = `${target.rel_path}/${name}`;
    const top = rel.split('/')[0]!;
    db.transaction(() => {
      moveOnDisk(absPath(lib, binRel(r.id, r.stored_name)), toAbsolute(root, rel));
      const categoryId = db.prepare("SELECT id FROM folders WHERE module = 'images' AND parent_id IS NULL AND rel_path = ? AND recycled = 0").pluck().get(top) as number;
      db.prepare('UPDATE files SET recycled = 0, rel_path = ?, filename = ?, folder_id = ?, category_id = ? WHERE id = ?')
        .run(rel, name, target.id, categoryId, r.entity_id);
      db.prepare('DELETE FROM recycle_items WHERE id = ?').run(r.id);
    })();
    dropBinDir(lib, r.id);
    emit({ type: 'files-changed' });
    emit({ type: 'folders-changed' });
    return { folderId: target.id };
  }

  // A folder: back under its parent (or the chosen one); its kind follows its new place.
  const parentId = targetId !== undefined ? targetId : r.original_parent_id;
  let parent = null;
  if (parentId !== null) {
    try {
      parent = liveFolder(lib, parentId);
    } catch {
      throw conflict('LOCATION_GONE', 'The original location is gone — use Restore to… and pick a new place.');
    }
  }
  const folder = db.prepare('SELECT id, uuid, kind FROM folders WHERE id = ?').get(r.entity_id) as { id: number; uuid: string; kind: FolderKind };
  assertCanHold(parent, folder.kind);
  const kind = kindAt(folder.kind, parent);
  const parentAbs = parent ? toAbsolute(root, parent.rel_path) : root;
  const name = uniqueName(parentAbs, r.stored_name, '');
  const rel = parent ? `${parent.rel_path}/${name}` : name;
  const from = binRel(r.id, r.stored_name);

  db.transaction(() => {
    moveOnDisk(absPath(lib, from), toAbsolute(root, rel));
    rewritePrefix(db, from, rel);
    const under = underPrefix('rel_path', rel);
    db.prepare(`UPDATE files SET recycled = 0 WHERE media_type = 'image' AND ${under.sql}`).run(...under.params);
    db.prepare(`UPDATE folders SET recycled = 0 WHERE module = 'images' AND ${under.sql}`).run(...under.params);
    db.prepare('UPDATE folders SET recycled = 0, rel_path = ?, name = ?, parent_id = ?, kind = ?, updated_at = ? WHERE id = ?')
      .run(rel, name, parent?.id ?? null, kind, Date.now(), folder.id);
    refreshCategories(lib, rel);
    db.prepare('DELETE FROM recycle_items WHERE id = ?').run(r.id);
  })();
  if (kind !== folder.kind) writeMarker(toAbsolute(root, rel), kind, lib.meta.id, folder.uuid);
  dropBinDir(lib, r.id);
  log('info', 'recycle', 'folder restored', { id: folder.id, to: rel });
  emit({ type: 'folders-changed' });
  emit({ type: 'files-changed' });
  return { folderId: parent?.id ?? null };
}

/** Delete from disk and from the DB (tags and collection entries go with the rows). */
export function deletePermanently(lib: OpenLibrary, recycleIds: number[]): { deleted: number } {
  const { db } = lib;
  let deleted = 0;
  for (const id of recycleIds) {
    const r = db.prepare('SELECT * FROM recycle_items WHERE id = ?').get(id) as RecycleRow | undefined;
    if (!r) continue;
    db.transaction(() => {
      if (r.entity === 'file') {
        db.prepare('DELETE FROM files WHERE id = ?').run(r.entity_id);
      } else if (r.entity === 'folder') {
        const under = underPrefix('rel_path', binRel(r.id, r.stored_name));
        db.prepare(`UPDATE folders SET cover_file_id = NULL WHERE cover_file_id IN (SELECT id FROM files WHERE ${under.sql})`).run(...under.params);
        db.prepare(`DELETE FROM files WHERE ${under.sql}`).run(...under.params);
        db.prepare('DELETE FROM folders WHERE id = ?').run(r.entity_id); // sub-folders cascade
      }
      db.prepare('DELETE FROM recycle_items WHERE id = ?').run(r.id);
    })();
    dropBinDir(lib, r.id);
    deleted++;
  }
  if (deleted > 0) {
    log('info', 'recycle', 'deleted permanently', { recycleIds, deleted });
    emit({ type: 'files-changed' });
  }
  return { deleted };
}

export function emptyBin(lib: OpenLibrary): { deleted: number } {
  const ids = lib.db.prepare('SELECT id FROM recycle_items').pluck().all() as number[];
  return deletePermanently(lib, ids);
}
