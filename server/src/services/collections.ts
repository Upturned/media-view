import {
  collectionNameProblem, displayTagName, normTagName,
  type CollectionCard, type CollectionDetail, type CollectionSnapshot, type FileCollection, type ThumbRef,
} from '@media-view/shared';
import type { DB } from '../db/connection.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { log } from '../lib/log.ts';
import { escapeLike } from '../lib/paths.ts';
import { thumbRef } from './folders.ts';
import type { OpenLibrary } from './library.ts';

/**
 * Collections (technical doc §6.6, milestone 6): ordered lists of images from anywhere in the library.
 * Nothing on disk changes. Positions are dense (0..n-1) and include recycled images, so a restore puts
 * an image back in its place; counts, covers and the numbers shown only look at live images.
 */

interface CollectionRow {
  id: number;
  name: string;
  description: string | null;
  cover_file_id: number | null;
  created_at: number;
  updated_at: number;
}

const LIVE_FILE = "f.recycled = 0 AND f.missing_since IS NULL AND f.media_type = 'image'";
const DESCRIPTION_MAX = 500;

/** Membership changes show in grids, the viewer and the index, so they count as a file change. */
function changed(): void {
  emit({ type: 'files-changed' });
}

function row(db: DB, id: number): CollectionRow {
  const c = db.prepare('SELECT id, name, description, cover_file_id, created_at, updated_at FROM collections WHERE id = ?').get(id) as CollectionRow | undefined;
  if (!c) throw notFound('COLLECTION_NOT_FOUND', 'This collection no longer exists.');
  return c;
}

function touch(db: DB, id: number): void {
  db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

function validName(raw: string): string {
  const problem = collectionNameProblem(raw);
  if (problem) throw badRequest('INVALID_NAME', problem);
  return displayTagName(raw);
}

function validDescription(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? '';
  if (text.length > DESCRIPTION_MAX) throw badRequest('TOO_LONG', `Descriptions can be up to ${DESCRIPTION_MAX} characters.`);
  return text || null;
}

/** Names are unique, ignoring case and space vs. `_` (so `@name` in a search finds one list). */
function assertNameFree(db: DB, name: string, self?: number): void {
  const taken = db.prepare('SELECT id, name FROM collections WHERE name_norm = ?').get(normTagName(name)) as { id: number; name: string } | undefined;
  if (taken && taken.id !== self) throw conflict('NAME_TAKEN', `“${taken.name}” already exists. Names are unique — capitals and _ vs. space don’t count.`);
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** The cover (chosen, if still live and on the list), then the next images in order: up to 5. */
function coversOf(db: DB, c: { id: number; cover_file_id: number | null }): ThumbRef[] {
  const rows = db.prepare(
    `SELECT f.id, f.hash, f.mtime FROM collection_items ci JOIN files f ON f.id = ci.file_id
     WHERE ci.collection_id = ? AND ${LIVE_FILE} ORDER BY ci.position LIMIT 6`,
  ).all(c.id) as { id: number; hash: string | null; mtime: number }[];
  let chosen: { id: number; hash: string | null; mtime: number } | undefined;
  if (c.cover_file_id) {
    chosen = rows.find((r) => r.id === c.cover_file_id) ?? db.prepare(
      `SELECT f.id, f.hash, f.mtime FROM collection_items ci JOIN files f ON f.id = ci.file_id
       WHERE ci.collection_id = ? AND ci.file_id = ? AND ${LIVE_FILE}`,
    ).get(c.id, c.cover_file_id) as typeof chosen;
  }
  const list = chosen ? [chosen, ...rows.filter((r) => r.id !== chosen.id)] : rows;
  return list.slice(0, 5).map(thumbRef);
}

function card(db: DB, c: CollectionRow, extra: { count: number; last_added: number | null; tagged?: number }): CollectionCard {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    count: extra.count,
    covers: coversOf(db, c),
    updatedAt: c.updated_at,
    lastAddedAt: extra.last_added,
    ...(extra.tagged !== undefined ? { tagged: extra.tagged } : {}),
  };
}

export interface CollectionListQuery {
  /** Name contains (space and `_` alike). */
  q?: string;
  /** Only collections holding images with this tag, with how many (`tagged`). */
  tag?: number;
  sort?: 'name' | 'count' | 'changed' | 'tagged';
  order?: 'asc' | 'desc';
  limit?: number;
}

export function listCollections(lib: OpenLibrary, opts: CollectionListQuery = {}): CollectionCard[] {
  const { db } = lib;
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.q?.trim()) {
    where.push("c.name_norm LIKE '%' || ? || '%' ESCAPE '\\'");
    params.push(escapeLike(normTagName(opts.q)));
  }
  const tagged = opts.tag !== undefined
    ? `(SELECT COUNT(*) FROM collection_items ci JOIN files f ON f.id = ci.file_id
        WHERE ci.collection_id = c.id AND ${LIVE_FILE} AND EXISTS (SELECT 1 FROM file_tags WHERE file_id = f.id AND tag_id = ${Number(opts.tag)}))`
    : 'NULL';
  if (opts.tag !== undefined) where.push(`${tagged} > 0`);
  const dir = opts.order === 'desc' ? 'DESC' : 'ASC';
  const sort = opts.sort ?? (opts.tag !== undefined ? 'tagged' : 'name');
  const order = sort === 'count' ? `count ${dir}, c.name COLLATE NOCASE`
    : sort === 'changed' ? `c.updated_at ${dir}, c.id ${dir}`
    : sort === 'tagged' ? `tagged ${dir === 'ASC' ? 'DESC' : 'ASC'}, count DESC, c.name COLLATE NOCASE`
    : `c.name COLLATE NOCASE ${dir}, c.id ${dir}`;
  const rows = db.prepare(
    `SELECT c.id, c.name, c.description, c.cover_file_id, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM collection_items ci JOIN files f ON f.id = ci.file_id WHERE ci.collection_id = c.id AND ${LIVE_FILE}) AS count,
            (SELECT MAX(added_at) FROM collection_items WHERE collection_id = c.id) AS last_added,
            ${tagged} AS tagged
     FROM collections c ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${order} ${opts.limit ? `LIMIT ${Math.max(1, Math.trunc(opts.limit))}` : ''}`,
  ).all(...params) as (CollectionRow & { count: number; last_added: number | null; tagged: number | null })[];
  return rows.map((r) => card(db, r, { count: r.count, last_added: r.last_added, ...(opts.tag !== undefined ? { tagged: r.tagged ?? 0 } : {}) }));
}

export function collectionDetail(lib: OpenLibrary, id: number): CollectionDetail {
  const { db } = lib;
  const c = row(db, id);
  const count = db.prepare(`SELECT COUNT(*) FROM collection_items ci JOIN files f ON f.id = ci.file_id WHERE ci.collection_id = ? AND ${LIVE_FILE}`).pluck().get(id) as number;
  const lastAdded = db.prepare('SELECT MAX(added_at) FROM collection_items WHERE collection_id = ?').pluck().get(id) as number | null;
  return { ...card(db, c, { count, last_added: lastAdded }), coverFileId: c.cover_file_id, createdAt: c.created_at, albums: albumsOf(db, id) };
}

/** The collections an image is on, by name, with its place in each (the viewer's Collections panel). */
export function collectionsOfFile(db: DB, fileId: number): FileCollection[] {
  const rows = db.prepare(
    `SELECT c.id, c.name, c.cover_file_id, c.updated_at,
            (SELECT COUNT(*) FROM collection_items a JOIN files f ON f.id = a.file_id
              WHERE a.collection_id = c.id AND ${LIVE_FILE} AND a.position <= ci.position) AS position,
            (SELECT COUNT(*) FROM collection_items a JOIN files f ON f.id = a.file_id WHERE a.collection_id = c.id AND ${LIVE_FILE}) AS total
     FROM collection_items ci JOIN collections c ON c.id = ci.collection_id WHERE ci.file_id = ? ORDER BY c.name COLLATE NOCASE`,
  ).all(fileId) as { id: number; name: string; cover_file_id: number | null; updated_at: number; position: number; total: number }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    position: r.position,
    total: r.total,
    cover: coversOf(db, r)[0] ?? null,
    updatedAt: r.updated_at,
  }));
}

/** Where a collection's images live: albums (and the Inbox) with how many, most first. */
function albumsOf(db: DB, id: number): CollectionDetail['albums'] {
  return (db.prepare(
    `SELECT fo.id, fo.name, fo.rel_path, COUNT(*) AS count FROM collection_items ci JOIN files f ON f.id = ci.file_id JOIN folders fo ON fo.id = f.folder_id
     WHERE ci.collection_id = ? AND ${LIVE_FILE} GROUP BY fo.id ORDER BY count DESC, fo.rel_path`,
  ).all(id) as { id: number; name: string; rel_path: string; count: number }[])
    .map((r) => ({ id: r.id, name: r.name, path: folderPath(r.rel_path), count: r.count }));
}

/** A folder's path for display: `Fantasy › Elves › Portraits`. */
export const folderPath = (relPath: string) => relPath.split('/').join(' › ');

/** The collection a search term names (exact, ignoring case and space vs. `_`), or null. */
export function resolveCollection(db: DB, name: string): number | null {
  return (db.prepare('SELECT id FROM collections WHERE name_norm = ?').pluck().get(normTagName(name)) as number | undefined) ?? null;
}

/** For the Add to collection dialog: how many of these images each collection already holds (only the ones with some). */
export function membership(lib: OpenLibrary, fileIds: number[]): { id: number; count: number }[] {
  if (fileIds.length === 0) return [];
  const ids = [...new Set(fileIds)];
  return lib.db.prepare(
    `SELECT collection_id AS id, COUNT(*) AS count FROM collection_items WHERE file_id IN (${ids.map(() => '?').join(',')}) GROUP BY collection_id`,
  ).all(...ids) as { id: number; count: number }[];
}

// ─── Writing ─────────────────────────────────────────────────────────────────

export function createCollection(lib: OpenLibrary, input: { name: string; description?: string | null }): CollectionDetail {
  const { db } = lib;
  const name = validName(input.name);
  assertNameFree(db, name);
  const now = Date.now();
  const id = db.prepare('INSERT INTO collections (name, name_norm, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, normTagName(name), validDescription(input.description), now, now).lastInsertRowid as number;
  changed();
  return collectionDetail(lib, id);
}

/** Rename, describe, or set the cover (null = back to the first image; the image must be on the list). */
export function updateCollection(lib: OpenLibrary, id: number, change: { name?: string; description?: string | null; coverFileId?: number | null }): CollectionDetail {
  const { db } = lib;
  row(db, id);
  db.transaction(() => {
    if (change.name !== undefined) {
      const name = validName(change.name);
      assertNameFree(db, name, id);
      db.prepare('UPDATE collections SET name = ?, name_norm = ? WHERE id = ?').run(name, normTagName(name), id);
    }
    if (change.description !== undefined) {
      db.prepare('UPDATE collections SET description = ? WHERE id = ?').run(validDescription(change.description), id);
    }
    if (change.coverFileId !== undefined) {
      if (change.coverFileId !== null) {
        const on = db.prepare('SELECT 1 FROM collection_items WHERE collection_id = ? AND file_id = ?').get(id, change.coverFileId);
        if (!on) throw badRequest('NOT_INSIDE', 'The cover must be an image on this list.');
      }
      db.prepare('UPDATE collections SET cover_file_id = ? WHERE id = ?').run(change.coverFileId, id);
    }
    touch(db, id);
  })();
  changed();
  return collectionDetail(lib, id);
}

/** Delete a collection (the images stay where they are); returns what's needed to undo it. */
export function deleteCollection(lib: OpenLibrary, id: number): CollectionSnapshot {
  const { db } = lib;
  const c = row(db, id);
  const fileIds = db.prepare('SELECT file_id FROM collection_items WHERE collection_id = ? ORDER BY position').pluck().all(id) as number[];
  db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  log('info', 'collections', 'deleted', { id, name: c.name, items: fileIds.length });
  changed();
  return { id, name: c.name, description: c.description, coverFileId: c.cover_file_id, createdAt: c.created_at, fileIds };
}

/** Undo a delete: the same id when it's still free (so links keep working), the same order and cover. */
export function restoreCollection(lib: OpenLibrary, snap: CollectionSnapshot): CollectionDetail {
  const { db } = lib;
  const name = validName(snap.name);
  assertNameFree(db, name);
  const id = db.transaction(() => {
    const free = !db.prepare('SELECT 1 FROM collections WHERE id = ?').get(snap.id);
    const now = Date.now();
    const newId = db.prepare('INSERT INTO collections (id, name, name_norm, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(free ? snap.id : null, name, normTagName(name), validDescription(snap.description), snap.createdAt, now).lastInsertRowid as number;
    const existing = db.prepare('SELECT id FROM files WHERE id = ?').pluck();
    const ins = db.prepare('INSERT INTO collection_items (collection_id, file_id, position, added_at) VALUES (?, ?, ?, ?)');
    let pos = 0;
    for (const fid of snap.fileIds) if (existing.get(fid) !== undefined) ins.run(newId, fid, pos++, now);
    if (snap.coverFileId && snap.fileIds.includes(snap.coverFileId) && existing.get(snap.coverFileId) !== undefined) {
      db.prepare('UPDATE collections SET cover_file_id = ? WHERE id = ?').run(snap.coverFileId, newId);
    }
    return newId;
  })();
  changed();
  return collectionDetail(lib, id);
}

/** Append images in the order given; ones already on the list are counted, not moved. */
export function addItems(lib: OpenLibrary, id: number, fileIds: number[]): { added: number; already: number } {
  const { db } = lib;
  row(db, id);
  const result = db.transaction(() => {
    const has = db.prepare('SELECT 1 FROM collection_items WHERE collection_id = ? AND file_id = ?');
    const live = db.prepare("SELECT 1 FROM files WHERE id = ? AND recycled = 0 AND media_type = 'image'");
    const ins = db.prepare('INSERT INTO collection_items (collection_id, file_id, position, added_at) VALUES (?, ?, ?, ?)');
    let next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM collection_items WHERE collection_id = ?').pluck().get(id) as number;
    const now = Date.now();
    let added = 0;
    let already = 0;
    for (const fid of new Set(fileIds)) {
      if (has.get(id, fid)) already++;
      else if (live.get(fid)) {
        ins.run(id, fid, next++, now);
        added++;
      }
    }
    if (added) touch(db, id);
    return { added, already };
  })();
  if (result.added) changed();
  return result;
}

function renumber(db: DB, id: number, order?: number[]): void {
  const ids = order ?? (db.prepare('SELECT file_id FROM collection_items WHERE collection_id = ? ORDER BY position').pluck().all(id) as number[]);
  const set = db.prepare('UPDATE collection_items SET position = ? WHERE collection_id = ? AND file_id = ?');
  ids.forEach((fid, pos) => set.run(pos, id, fid));
}

/** Take images off the list (never deletes them). A removed cover falls back to the first image. */
export function removeItems(lib: OpenLibrary, id: number, fileIds: number[]): { removed: number; previous: number[] } {
  const { db } = lib;
  const c = row(db, id);
  const previous = db.prepare('SELECT file_id FROM collection_items WHERE collection_id = ? ORDER BY position').pluck().all(id) as number[];
  const removed = db.transaction(() => {
    const del = db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND file_id = ?');
    const n = [...new Set(fileIds)].reduce((sum, fid) => sum + del.run(id, fid).changes, 0);
    if (n) {
      if (c.cover_file_id && fileIds.includes(c.cover_file_id)) db.prepare('UPDATE collections SET cover_file_id = NULL WHERE id = ?').run(id);
      renumber(db, id);
      touch(db, id);
    }
    return n;
  })();
  if (removed) changed();
  return { removed, previous };
}

/**
 * Reorder: move images (kept in their current relative order) to just before `before`, or to the end
 * when `before` is null. The grid sends this after a drag.
 */
export function moveItems(lib: OpenLibrary, id: number, fileIds: number[], before: number | null): { previous: number[] } {
  const { db } = lib;
  row(db, id);
  const previous = db.transaction(() => {
    const order = db.prepare('SELECT file_id FROM collection_items WHERE collection_id = ? ORDER BY position').pluck().all(id) as number[];
    const moving = new Set(fileIds);
    const moved = order.filter((f) => moving.has(f));
    if (moved.length === 0) return order;
    const rest = order.filter((f) => !moving.has(f));
    let anchor: number | undefined;
    if (before !== null) {
      const from = order.indexOf(before);
      if (from < 0) throw badRequest('NOT_INSIDE', 'That image isn’t on this list.');
      // Dropped on one of the moved images: anchor on the first image after it that stays put.
      anchor = order.slice(from).find((f) => !moving.has(f));
    }
    const at = anchor === undefined ? rest.length : rest.indexOf(anchor);
    const next = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
    renumber(db, id, next);
    touch(db, id);
    return order;
  })();
  changed();
  return { previous };
}

/**
 * Put the list in this exact order (Undo after a reorder or a remove): images missing from the list
 * are added back, and any not named keep their relative order at the end.
 */
export function setOrder(lib: OpenLibrary, id: number, fileIds: number[]): void {
  const { db } = lib;
  row(db, id);
  db.transaction(() => {
    const current = db.prepare('SELECT file_id FROM collection_items WHERE collection_id = ? ORDER BY position').pluck().all(id) as number[];
    const have = new Set(current);
    const exists = db.prepare('SELECT 1 FROM files WHERE id = ?');
    const ins = db.prepare('INSERT INTO collection_items (collection_id, file_id, position, added_at) VALUES (?, ?, 0, ?)');
    const now = Date.now();
    const named = [...new Set(fileIds)].filter((f) => have.has(f) || exists.get(f));
    for (const f of named) if (!have.has(f)) ins.run(id, f, now);
    const namedSet = new Set(named);
    renumber(db, id, [...named, ...current.filter((f) => !namedSet.has(f))]);
    touch(db, id);
  })();
  changed();
}
