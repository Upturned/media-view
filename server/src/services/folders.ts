import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { Crumb, FolderCard, FolderDetail, FolderKind, InboxSummary, ThumbRef } from '@media-view/shared';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { log } from '../lib/log.ts';
import { writeMarker } from '../lib/markers.ts';
import { expectChange } from '../lib/expected.ts';
import { validateName } from '../lib/names.ts';
import { toAbsolute, underPrefix } from '../lib/paths.ts';
import type { OpenLibrary } from './library.ts';
import { rewritePrefix } from './tree.ts';

/** Folders of the Images module: cards, details, creation and changes (technical doc §6.2, §7.3). */

export interface FolderRow {
  id: number;
  parent_id: number | null;
  kind: FolderKind;
  name: string;
  rel_path: string;
  description: string | null;
  cover_file_id: number | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COVERS = 3;

/** Live (not missing, not recycled) folders of the module, with image counts rolled up the tree. */
export class FolderTree {
  readonly rows: FolderRow[];
  readonly byId: Map<number, FolderRow>;
  private readonly totals = new Map<number, number>();

  constructor(private readonly lib: OpenLibrary) {
    this.rows = lib.db.prepare(
      `SELECT id, parent_id, kind, name, rel_path, description, cover_file_id FROM folders
       WHERE module = 'images' AND missing_since IS NULL AND recycled = 0`,
    ).all() as FolderRow[];
    this.byId = new Map(this.rows.map((r) => [r.id, r]));

    const direct = lib.db.prepare(
      `SELECT folder_id, COUNT(*) AS n FROM files
       WHERE media_type = 'image' AND recycled = 0 AND missing_since IS NULL GROUP BY folder_id`,
    ).all() as { folder_id: number; n: number }[];
    for (const { folder_id, n } of direct) {
      for (let f = this.byId.get(folder_id); f; f = f.parent_id ? this.byId.get(f.parent_id) : undefined) {
        this.totals.set(f.id, (this.totals.get(f.id) ?? 0) + n);
      }
    }
  }

  /** Images in a folder and everything under it. */
  count(id: number): number {
    return this.totals.get(id) ?? 0;
  }

  children(parentId: number | null): FolderRow[] {
    return this.rows
      .filter((r) => r.parent_id === parentId && r.kind !== 'inbox')
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }

  ancestors(folder: FolderRow): Crumb[] {
    const chain: Crumb[] = [];
    for (let p = folder.parent_id ? this.byId.get(folder.parent_id) : undefined; p; p = p.parent_id ? this.byId.get(p.parent_id) : undefined) {
      chain.unshift({ id: p.id, kind: p.kind, name: p.name });
    }
    return chain;
  }

  card(f: FolderRow): FolderCard {
    const kids = this.rows.filter((r) => r.parent_id === f.id);
    return {
      id: f.id,
      kind: f.kind,
      name: f.name,
      description: f.description,
      imageCount: this.totals.get(f.id) ?? 0,
      subcategoryCount: kids.filter((k) => k.kind === 'subcategory').length,
      albumCount: kids.filter((k) => k.kind === 'album').length,
      covers: this.covers(f),
    };
  }

  /** The chosen cover first, then the first images under the folder. */
  private covers(f: FolderRow): ThumbRef[] {
    const { db } = this.lib;
    const refs: ThumbRef[] = [];
    if (f.cover_file_id) {
      const c = db.prepare('SELECT id, hash, mtime FROM files WHERE id = ? AND recycled = 0 AND missing_since IS NULL')
        .get(f.cover_file_id) as { id: number; hash: string | null; mtime: number } | undefined;
      if (c) refs.push(thumbRef(c));
    }
    const under = underPrefix('rel_path', f.rel_path);
    const first = db.prepare(
      `SELECT id, hash, mtime FROM files
       WHERE media_type = 'image' AND recycled = 0 AND missing_since IS NULL AND ${under.sql}
       ORDER BY rel_path LIMIT ?`,
    ).all(...under.params, COVERS) as { id: number; hash: string | null; mtime: number }[];
    for (const r of first) if (refs.length < COVERS && !refs.some((x) => x.id === r.id)) refs.push(thumbRef(r));
    return refs;
  }
}

export function thumbRef(r: { id: number; hash: string | null; mtime: number }): ThumbRef {
  return { id: r.id, v: r.hash ? r.hash.slice(0, 16) : String(r.mtime) };
}

export function libraryFront(lib: OpenLibrary): { inbox: InboxSummary; categories: FolderCard[] } {
  const tree = new FolderTree(lib);
  const inboxRow = tree.rows.find((r) => r.kind === 'inbox');
  if (!inboxRow) throw notFound('NO_INBOX', 'The Inbox is missing; rescan the library.');
  return { inbox: inboxSummary(lib, tree.card(inboxRow)), categories: tree.children(null).map((r) => tree.card(r)) };
}

function inboxSummary(lib: OpenLibrary, card: FolderCard): InboxSummary {
  const stats = lib.db.prepare(
    `SELECT SUM(added_at > ?) AS recent, MIN(added_at) AS oldest FROM files
     WHERE folder_id = ? AND recycled = 0 AND missing_since IS NULL`,
  ).get(Date.now() - WEEK_MS, card.id) as { recent: number | null; oldest: number | null };
  return { ...card, newThisWeek: stats.recent ?? 0, oldestAddedAt: stats.oldest };
}

export function folderChildren(lib: OpenLibrary, parentId: number): FolderCard[] {
  const tree = new FolderTree(lib);
  if (!tree.byId.has(parentId)) throw notFound('FOLDER_NOT_FOUND', 'This folder no longer exists.');
  return tree.children(parentId).map((r) => tree.card(r));
}

export function folderDetail(lib: OpenLibrary, id: number): FolderDetail | InboxSummary & FolderDetail {
  const tree = new FolderTree(lib);
  const f = tree.byId.get(id);
  if (!f) throw notFound('FOLDER_NOT_FOUND', 'This folder no longer exists.');
  const card = tree.card(f);
  const detail: FolderDetail = { ...card, relPath: f.rel_path, parentId: f.parent_id, ancestors: tree.ancestors(f) };
  return f.kind === 'inbox' ? { ...detail, ...inboxSummary(lib, card) } : detail;
}

// ─── Changes: validate, then disk, then the DB in one transaction (technical doc §7.3) ─

interface LiveFolder extends FolderRow {
  uuid: string;
}

/** A live folder (not missing, not recycled), or 404. */
export function liveFolder(lib: OpenLibrary, id: number): LiveFolder {
  const f = lib.db.prepare(
    `SELECT id, uuid, parent_id, kind, name, rel_path, description, cover_file_id FROM folders
     WHERE id = ? AND module = 'images' AND missing_since IS NULL AND recycled = 0`,
  ).get(id) as LiveFolder | undefined;
  if (!f) throw notFound('FOLDER_NOT_FOUND', 'This folder no longer exists.');
  return f;
}

/** The kind a folder takes at a position: top level → category; nested category → sub-category. */
export function kindAt(kind: FolderKind, parent: { kind: FolderKind } | null): FolderKind {
  if (!parent) return 'category';
  return kind === 'category' ? 'subcategory' : kind;
}

/** Throws unless `parent` (null = top level) can hold a folder of `kind`. */
export function assertCanHold(parent: { kind: FolderKind } | null, kind: FolderKind): void {
  if (!parent && kind === 'album') throw badRequest('INVALID_PARENT', "Albums can't sit at the top level. Pick a category or sub-category.");
  if (parent && (parent.kind === 'album' || parent.kind === 'inbox')) throw badRequest('INVALID_PARENT', 'Albums hold only images.');
}

/** Create a category (no parent), sub-category or album, on disk and in the DB. */
export function createFolder(lib: OpenLibrary, input: { parentId: number | null; kind: FolderKind; name: string }): FolderCard {
  const { db } = lib;
  const name = validateName(input.name);
  const parent = input.parentId !== null ? liveFolder(lib, input.parentId) : null;

  if (input.kind === 'inbox') throw badRequest('INVALID_KIND', 'There is only one Inbox.');
  if (!parent && input.kind !== 'category') throw badRequest('INVALID_KIND', 'Only categories can be created at the top level.');
  if (parent && input.kind === 'category') throw badRequest('INVALID_KIND', 'A category inside a folder is a sub-category.');
  assertCanHold(parent, input.kind);

  const relPath = parent ? `${parent.rel_path}/${name}` : name;
  const abs = toAbsolute(lib.moduleRoot('images'), relPath);
  assertFree(lib, relPath, abs, name);

  const uuid = randomUUID();
  expectChange(abs);
  fs.mkdirSync(abs);
  try {
    writeMarker(abs, input.kind, lib.meta.id, uuid);
    const now = Date.now();
    const id = db.prepare(
      `INSERT INTO folders (uuid, module, parent_id, kind, name, rel_path, created_at, updated_at)
       VALUES (?, 'images', ?, ?, ?, ?, ?, ?)`,
    ).run(uuid, parent?.id ?? null, input.kind, name, relPath, now, now).lastInsertRowid as number;
    log('info', 'folders', 'folder created', { id, kind: input.kind, path: relPath });
    emit({ type: 'folders-changed' });
    const tree = new FolderTree(lib);
    return tree.card(tree.byId.get(id)!);
  } catch (err) {
    fs.rmSync(abs, { recursive: true, force: true });
    throw err;
  }
}

function assertFree(lib: OpenLibrary, relPath: string, abs: string, name: string, self?: number): void {
  const taken = lib.db.prepare("SELECT id FROM folders WHERE module = 'images' AND rel_path = ? AND recycled = 0").pluck().get(relPath) as number | undefined;
  // A case-only rename of the folder itself is fine.
  if ((taken !== undefined && taken !== self) || (taken === undefined && fs.existsSync(abs))) {
    throw conflict('NAME_TAKEN', `“${name}” already exists there.`);
  }
}

/** Rename a folder on disk; everything under it follows. */
export function renameFolder(lib: OpenLibrary, id: number, rawName: string): FolderCard {
  const f = liveFolder(lib, id);
  if (f.kind === 'inbox') throw badRequest('INBOX_FIXED', "The Inbox can't be renamed.");
  const name = validateName(rawName);
  if (name === f.name) return cardOf(lib, id);
  const parentRel = f.rel_path.includes('/') ? f.rel_path.slice(0, f.rel_path.lastIndexOf('/')) : '';
  const relPath = parentRel ? `${parentRel}/${name}` : name;
  relocate(lib, f, relPath, f.parent_id, f.kind);
  log('info', 'folders', 'folder renamed', { id, from: f.rel_path, to: relPath });
  return cardOf(lib, id);
}

/** Move a folder under another (null = top level); its kind follows its new place. */
export function moveFolder(lib: OpenLibrary, id: number, parentId: number | null): FolderCard {
  const f = liveFolder(lib, id);
  if (f.kind === 'inbox') throw badRequest('INBOX_FIXED', "The Inbox can't be moved.");
  const parent = parentId !== null ? liveFolder(lib, parentId) : null;
  if (parent && (parent.id === f.id || parent.rel_path.toLowerCase().startsWith(f.rel_path.toLowerCase() + '/'))) {
    throw badRequest('INVALID_PARENT', "A folder can't be moved into itself.");
  }
  if (parent?.id === f.parent_id || (!parent && f.parent_id === null)) return cardOf(lib, id);
  assertCanHold(parent, f.kind);
  const relPath = parent ? `${parent.rel_path}/${f.name}` : f.name;
  relocate(lib, f, relPath, parent?.id ?? null, kindAt(f.kind, parent));
  log('info', 'folders', 'folder moved', { id, from: f.rel_path, to: relPath });
  return cardOf(lib, id);
}

/** Disk rename/move of a folder, then its row, everything under it and the files' category. */
function relocate(lib: OpenLibrary, f: LiveFolder, relPath: string, parentId: number | null, kind: FolderKind): void {
  const { db } = lib;
  const root = lib.moduleRoot('images');
  const from = toAbsolute(root, f.rel_path);
  const to = toAbsolute(root, relPath);
  assertFree(lib, relPath, to, baseNameOf(relPath), f.id);

  expectChange(from, to);
  fs.renameSync(from, to);
  try {
    db.transaction(() => {
      rewritePrefix(db, f.rel_path, relPath);
      db.prepare('UPDATE folders SET rel_path = ?, name = ?, parent_id = ?, kind = ?, updated_at = ? WHERE id = ?')
        .run(relPath, baseNameOf(relPath), parentId, kind, Date.now(), f.id);
      refreshCategories(lib, relPath);
    })();
  } catch (err) {
    fs.renameSync(to, from); // undo the disk change
    throw err;
  }
  if (kind !== f.kind) writeMarker(to, kind, lib.meta.id, f.uuid);
  emit({ type: 'folders-changed' });
  emit({ type: 'files-changed' });
}

/** Re-derive `files.category_id` for everything at or under `relPath` (its top-level folder may have changed). */
export function refreshCategories(lib: OpenLibrary, relPath: string): void {
  const top = relPath.split('/')[0]!;
  const topId = lib.db.prepare("SELECT id FROM folders WHERE module = 'images' AND parent_id IS NULL AND rel_path = ? AND recycled = 0")
    .pluck().get(top) as number | undefined;
  if (topId === undefined) return;
  const under = underPrefix('rel_path', relPath);
  lib.db.prepare(`UPDATE files SET category_id = ? WHERE media_type = 'image' AND ${under.sql}`).run(topId, ...under.params);
}

const baseNameOf = (relPath: string) => relPath.slice(relPath.lastIndexOf('/') + 1);

function cardOf(lib: OpenLibrary, id: number): FolderCard {
  const tree = new FolderTree(lib);
  return tree.card(tree.byId.get(id)!);
}

export const MAX_DESCRIPTION = 600;

export function setFolderDescription(lib: OpenLibrary, id: number, text: string): FolderCard {
  liveFolder(lib, id);
  const value = text.trim();
  if (value.length > MAX_DESCRIPTION) throw badRequest('TOO_LONG', `Descriptions can be up to ${MAX_DESCRIPTION} characters.`);
  lib.db.prepare('UPDATE folders SET description = ?, updated_at = ? WHERE id = ?').run(value || null, Date.now(), id);
  emit({ type: 'folders-changed' });
  return cardOf(lib, id);
}

/** Set (or clear, with null) a folder's cover. The image must be inside the folder. */
export function setFolderCover(lib: OpenLibrary, id: number, fileId: number | null): FolderCard {
  const f = liveFolder(lib, id);
  if (fileId !== null) {
    const rel = lib.db.prepare('SELECT rel_path FROM files WHERE id = ? AND recycled = 0 AND missing_since IS NULL').pluck().get(fileId) as string | undefined;
    if (!rel) throw notFound('FILE_NOT_FOUND', 'This image no longer exists.');
    if (!rel.toLowerCase().startsWith(f.rel_path.toLowerCase() + '/')) throw badRequest('NOT_INSIDE', 'The cover must be an image inside the folder.');
  }
  lib.db.prepare('UPDATE folders SET cover_file_id = ?, updated_at = ? WHERE id = ?').run(fileId, Date.now(), id);
  emit({ type: 'folders-changed' });
  return cardOf(lib, id);
}

/** Every live folder, flat, for the folder picker (Move / Copy / Restore to…). */
export function folderTree(lib: OpenLibrary): { id: number; parentId: number | null; kind: FolderKind; name: string; imageCount: number }[] {
  const tree = new FolderTree(lib);
  return tree.rows
    .map((r) => ({ id: r.id, parentId: r.parent_id, kind: r.kind, name: r.name, imageCount: tree.count(r.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Folders whose name contains every word of `text` (the Search page): racks, drawers and albums, with
 * where they are (`Fantasy \ Elves`). Names starting with the first word come first.
 */
export function searchFolders(lib: OpenLibrary, text: string): (FolderCard & { path: string })[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const tree = new FolderTree(lib);
  return tree.rows
    .filter((r) => r.kind !== 'inbox' && words.every((w) => r.name.toLowerCase().includes(w)))
    .sort((a, b) =>
      Number(!b.name.toLowerCase().startsWith(words[0]!)) - Number(!a.name.toLowerCase().startsWith(words[0]!))
      || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, 500)
    .map((r) => ({ ...tree.card(r), path: tree.ancestors(r).map((c) => c.name).join(' \\ ') }));
}
