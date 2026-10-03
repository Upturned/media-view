import type { FileDetail, FileItem, SortKey } from '@media-view/shared';
import { badRequest, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { log } from '../lib/log.ts';
import { escapeLike, underPrefix } from '../lib/paths.ts';
import { folderDetail, thumbRef } from './folders.ts';
import type { OpenLibrary } from './library.ts';

/** Listing and querying image files (technical doc §11.2; tags and search syntax arrive in milestone 4). */

export interface FileQuery {
  /** Folder scope; without it, the whole library. */
  folder?: number;
  /** With `folder`: everything under it, not only its direct images. */
  recursive?: boolean;
  favorites?: boolean;
  /** File name contains (case-insensitive). */
  name?: string;
  sort: SortKey;
  order: 'asc' | 'desc';
  /** Random order seed, stable across pages. */
  seed?: number;
}

export const PAGE_SIZE = 200;

interface FileRow {
  id: number;
  filename: string;
  ext: string;
  size: number;
  mtime: number;
  added_at: number;
  favorited: number;
  width: number | null;
  height: number | null;
  hash: string | null;
  rel_path: string;
  folder_id: number;
  description: string | null;
}

const COLUMNS = 'f.id, f.filename, f.ext, f.size, f.mtime, f.added_at, f.favorited, f.width, f.height, f.hash, f.rel_path, f.folder_id, f.description';

function toItem(r: FileRow): FileItem {
  return {
    id: r.id,
    filename: r.filename,
    ext: r.ext,
    size: r.size,
    mtime: r.mtime,
    addedAt: r.added_at,
    favorited: r.favorited === 1,
    width: r.width,
    height: r.height,
    v: thumbRef(r).v,
  };
}

function where(lib: OpenLibrary, q: FileQuery): { sql: string; params: unknown[] } {
  const parts = ["f.media_type = 'image'", 'f.recycled = 0', 'f.missing_since IS NULL'];
  const params: unknown[] = [];
  if (q.folder !== undefined) {
    const folder = lib.db.prepare('SELECT rel_path FROM folders WHERE id = ?').get(q.folder) as { rel_path: string } | undefined;
    if (!folder) throw notFound('FOLDER_NOT_FOUND', 'This folder no longer exists.');
    if (q.recursive) {
      const under = underPrefix('f.rel_path', folder.rel_path);
      parts.push(under.sql);
      params.push(...under.params);
    } else {
      // Directly in the folder: files attached to it from a nested, rule-breaking folder don't count.
      parts.push("f.folder_id = ? AND f.rel_path = ? || '/' || f.filename");
      params.push(q.folder, folder.rel_path);
    }
  }
  if (q.favorites) parts.push('f.favorited = 1');
  if (q.name?.trim()) {
    parts.push("f.filename LIKE '%' || ? || '%' ESCAPE '\\'");
    params.push(escapeLike(q.name.trim()));
  }
  return { sql: parts.join(' AND '), params };
}

function orderBy(q: FileQuery): string {
  const dir = q.order === 'desc' ? 'DESC' : 'ASC';
  switch (q.sort) {
    case 'name': return `f.filename COLLATE NOCASE ${dir}, f.id ${dir}`;
    case 'modified': return `f.mtime ${dir}, f.id ${dir}`;
    case 'added': return `f.added_at ${dir}, f.id ${dir}`;
    case 'size': return `f.size ${dir}, f.id ${dir}`;
    case 'random': {
      const seed = Math.trunc(q.seed ?? 1) % 2147483647 || 1;
      return `(f.id * ${seed}) % 2147483647, f.id`;
    }
  }
}

export function listFiles(lib: OpenLibrary, q: FileQuery, offset = 0, limit = PAGE_SIZE): { items: FileItem[]; total: number } {
  if (limit < 1 || limit > 500) throw badRequest('INVALID_LIMIT', 'limit must be between 1 and 500.');
  const w = where(lib, q);
  const total = lib.db.prepare(`SELECT COUNT(*) FROM files f WHERE ${w.sql}`).pluck().get(...w.params) as number;
  const rows = lib.db.prepare(
    `SELECT ${COLUMNS} FROM files f WHERE ${w.sql} ORDER BY ${orderBy(q)} LIMIT ? OFFSET ?`,
  ).all(...w.params, limit, Math.max(0, offset)) as FileRow[];
  return { items: rows.map(toItem), total };
}

/** Every id of a query, in order (for "Select all" without loading every item). */
export function listFileIds(lib: OpenLibrary, q: FileQuery): number[] {
  const w = where(lib, q);
  return lib.db.prepare(`SELECT f.id FROM files f WHERE ${w.sql} ORDER BY ${orderBy(q)}`).pluck().all(...w.params) as number[];
}

/** Position of a file inside a query's results (for the viewer's prev / next), or null if not in it. */
export function locateFile(lib: OpenLibrary, q: FileQuery, id: number): { index: number; total: number } | null {
  const w = where(lib, q);
  const row = lib.db.prepare(
    `SELECT idx, total FROM (
       SELECT f.id, ROW_NUMBER() OVER (ORDER BY ${orderBy(q)}) - 1 AS idx, COUNT(*) OVER () AS total
       FROM files f WHERE ${w.sql}
     ) WHERE id = ?`,
  ).get(...w.params, id) as { idx: number; total: number } | undefined;
  return row ? { index: row.idx, total: row.total } : null;
}

/** A random file of the query, never `exclude` (unless it's the only one). */
export function randomFile(lib: OpenLibrary, q: FileQuery, exclude?: number): number | null {
  const w = where(lib, q);
  const pick = (extra: string, params: unknown[]) => lib.db.prepare(
    `SELECT f.id FROM files f WHERE ${w.sql} ${extra} ORDER BY random() LIMIT 1`,
  ).pluck().get(...w.params, ...params) as number | undefined;
  return pick(exclude ? 'AND f.id <> ?' : '', exclude ? [exclude] : []) ?? pick('', []) ?? null;
}

export function fileDetail(lib: OpenLibrary, id: number): FileDetail {
  const row = lib.db.prepare(`SELECT ${COLUMNS} FROM files f WHERE f.id = ? AND f.recycled = 0`).get(id) as FileRow | undefined;
  if (!row) throw notFound('FILE_NOT_FOUND', 'This image no longer exists.');
  const folder = folderDetail(lib, row.folder_id);
  return {
    ...toItem(row),
    relPath: row.rel_path,
    description: row.description,
    folder: { id: folder.id, kind: folder.kind, name: folder.name },
    ancestors: folder.ancestors,
  };
}

export function setFavorite(lib: OpenLibrary, ids: number[], favorited: boolean): number {
  const update = lib.db.prepare('UPDATE files SET favorited = ? WHERE id = ? AND recycled = 0');
  const changed = lib.db.transaction(() => ids.reduce((n, id) => n + update.run(favorited ? 1 : 0, id).changes, 0))();
  if (ids.length > 1) log('info', 'files', favorited ? 'bulk favorite' : 'bulk unfavorite', { ids, changed });
  emit({ type: 'files-changed' });
  return changed;
}
