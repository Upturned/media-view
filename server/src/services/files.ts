import { parseQuery, type FileDetail, type FileItem, type SortKey, type TagRef } from '@media-view/shared';
import { badRequest, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { log } from '../lib/log.ts';
import { escapeLike, underPrefix } from '../lib/paths.ts';
import { folderDetail, thumbRef } from './folders.ts';
import type { OpenLibrary } from './library.ts';
import { resolveTerm, tagsOfFile } from './tags.ts';

/** Listing and querying image files with the search syntax (technical doc §11.2). */

export interface FileQuery {
  /** Folder scope; without it, the whole library. */
  folder?: number;
  /** With `folder`: everything under it, not only its direct images. */
  recursive?: boolean;
  favorites?: boolean;
  /** File name contains (case-insensitive). */
  name?: string;
  /** A search in the search syntax: tags (must / never / any of) and words in file and folder names. */
  q?: string;
  /** Images carrying this tag (tag galleries). */
  tag?: number;
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
    folderId: r.folder_id,
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

interface Where {
  sql: string;
  params: unknown[];
  /** Tag terms that match no tag (shown as a hint, not an error). */
  unknown: string[];
}

function where(lib: OpenLibrary, q: FileQuery): Where {
  const parts = ["f.media_type = 'image'", 'f.recycled = 0', 'f.missing_since IS NULL'];
  const params: unknown[] = [];
  const unknown: string[] = [];
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
  if (q.tag !== undefined) {
    parts.push('EXISTS (SELECT 1 FROM file_tags WHERE file_id = f.id AND tag_id = ?)');
    params.push(q.tag);
  }
  if (q.q?.trim()) searchTerms(lib, q.q, parts, params, unknown);
  return { sql: parts.join(' AND '), params, unknown };
}

const inList = (ids: number[]) => ids.map(() => '?').join(',');

/** Each term becomes one condition, all ANDed; the "any of" terms form one group (technical doc §11.2). */
function searchTerms(lib: OpenLibrary, query: string, parts: string[], params: unknown[], unknown: string[]): void {
  const keys = lib.db.prepare('SELECT key FROM tag_types').pluck().all() as string[];
  const anyOf = new Set<number>();
  let anyTerms = 0;
  for (const t of parseQuery(query, keys)) {
    if (t.kind === 'text') {
      parts.push(`f.rel_path ${t.op === 'never' ? 'NOT ' : ''}LIKE '%' || ? || '%' ESCAPE '\\'`);
      params.push(escapeLike(t.value));
      continue;
    }
    if (!t.name) continue; // still being typed
    const ids = resolveTerm(lib.db, t.type, t.name);
    if (ids.length === 0) unknown.push(t.type ? `${t.type}:${t.name}` : t.name);
    if (t.op === 'any') {
      anyTerms++;
      ids.forEach((id) => anyOf.add(id));
    } else if (t.op === 'must') {
      if (ids.length === 0) parts.push('0');
      else {
        parts.push(`EXISTS (SELECT 1 FROM file_tags WHERE file_id = f.id AND tag_id IN (${inList(ids)}))`);
        params.push(...ids);
      }
    } else if (ids.length > 0) {
      parts.push(`NOT EXISTS (SELECT 1 FROM file_tags WHERE file_id = f.id AND tag_id IN (${inList(ids)}))`);
      params.push(...ids);
    }
  }
  if (anyTerms > 0) {
    if (anyOf.size === 0) parts.push('0');
    else {
      parts.push(`EXISTS (SELECT 1 FROM file_tags WHERE file_id = f.id AND tag_id IN (${inList([...anyOf])}))`);
      params.push(...anyOf);
    }
  }
}

/**
 * Tag counts over the images a query matches (the tag sidebar), top 100 — plus the tags the query
 * names, so an excluded tag stays in the list to be switched off.
 */
export function tagCounts(lib: OpenLibrary, q: FileQuery): (TagRef & { count: number })[] {
  const w = where(lib, q);
  const rows = lib.db.prepare(
    `SELECT t.id, t.type_id, t.name, COUNT(*) AS n FROM file_tags ft JOIN files f ON f.id = ft.file_id JOIN tags t ON t.id = ft.tag_id
     WHERE ${w.sql} GROUP BY t.id ORDER BY n DESC, t.name LIMIT 100`,
  ).all(...w.params) as { id: number; type_id: number; name: string; n: number }[];
  const out = rows.map((r) => ({ id: r.id, typeId: r.type_id, name: r.name, count: r.n }));
  if (q.q) {
    const keys = lib.db.prepare('SELECT key FROM tag_types').pluck().all() as string[];
    for (const t of parseQuery(q.q, keys)) {
      if (t.kind !== 'tag' || !t.name) continue;
      for (const id of resolveTerm(lib.db, t.type, t.name)) {
        if (out.some((o) => o.id === id)) continue;
        const tag = lib.db.prepare('SELECT id, type_id, name FROM tags WHERE id = ?').get(id) as { id: number; type_id: number; name: string };
        out.push({ id: tag.id, typeId: tag.type_id, name: tag.name, count: 0 });
      }
    }
  }
  return out;
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

export function listFiles(lib: OpenLibrary, q: FileQuery, offset = 0, limit = PAGE_SIZE): { items: FileItem[]; total: number; unknown: string[] } {
  if (limit < 1 || limit > 500) throw badRequest('INVALID_LIMIT', 'limit must be between 1 and 500.');
  const w = where(lib, q);
  const total = lib.db.prepare(`SELECT COUNT(*) FROM files f WHERE ${w.sql}`).pluck().get(...w.params) as number;
  const rows = lib.db.prepare(
    `SELECT ${COLUMNS} FROM files f WHERE ${w.sql} ORDER BY ${orderBy(q)} LIMIT ? OFFSET ?`,
  ).all(...w.params, limit, Math.max(0, offset)) as FileRow[];
  return { items: rows.map(toItem), total, unknown: w.unknown };
}

/** Name, star and folder of each id, in the order given (for actions on a selection that isn't all loaded). */
export function briefFiles(lib: OpenLibrary, ids: number[]): { id: number; filename: string; favorited: boolean; folderId: number }[] {
  const get = lib.db.prepare('SELECT id, filename, favorited, folder_id FROM files WHERE id = ? AND recycled = 0');
  return ids
    .map((id) => get.get(id) as { id: number; filename: string; favorited: number; folder_id: number } | undefined)
    .filter((r) => !!r)
    .map((r) => ({ id: r.id, filename: r.filename, favorited: r.favorited === 1, folderId: r.folder_id }));
}

/** Lowercase file names in a folder (to show name clashes before moving or renaming). */
export function folderFileNames(lib: OpenLibrary, folderId: number): string[] {
  return lib.db.prepare("SELECT lower(filename) FROM files WHERE folder_id = ? AND recycled = 0 AND media_type = 'image'").pluck().all(folderId) as string[];
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
    tags: tagsOfFile(lib.db, id),
  };
}

export function setFavorite(lib: OpenLibrary, ids: number[], favorited: boolean): number {
  const update = lib.db.prepare('UPDATE files SET favorited = ? WHERE id = ? AND recycled = 0');
  const changed = lib.db.transaction(() => ids.reduce((n, id) => n + update.run(favorited ? 1 : 0, id).changes, 0))();
  if (ids.length > 1) log('info', 'files', favorited ? 'bulk favorite' : 'bulk unfavorite', { ids, changed });
  emit({ type: 'files-changed' });
  return changed;
}
