import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { Crumb, FolderCard, FolderDetail, FolderKind, InboxSummary, ThumbRef } from '@media-view/shared';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { log } from '../lib/log.ts';
import { writeMarker } from '../lib/markers.ts';
import { toAbsolute, underPrefix } from '../lib/paths.ts';
import type { OpenLibrary } from './library.ts';

/** Folders of the Images module: cards, details and creation (technical doc §6.2, §7.3). */

interface FolderRow {
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
class FolderTree {
  readonly rows: FolderRow[];
  readonly byId: Map<number, FolderRow>;
  private readonly totals = new Map<number, number>();

  constructor(private readonly lib: OpenLibrary) {
    this.rows = lib.db.prepare(
      `SELECT id, parent_id, kind, name, rel_path, description, cover_file_id FROM folders
       WHERE module = 'images' AND missing_since IS NULL
         AND id NOT IN (SELECT entity_id FROM recycle_items WHERE entity = 'folder')`,
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

// ─── Creation ────────────────────────────────────────────────────────────────

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** A valid Windows folder name, or an error explaining why not. */
export function validateFolderName(raw: string): string {
  const name = raw.normalize('NFC').trim();
  if (!name) throw badRequest('INVALID_NAME', 'The name is empty.');
  if (name.length > 200) throw badRequest('INVALID_NAME', 'The name is too long.');
  if (INVALID_CHARS.test(name)) throw badRequest('INVALID_NAME', 'Names can\'t contain < > : " / \\ | ? *');
  if (name.startsWith('.')) throw badRequest('INVALID_NAME', 'Names can\'t start with a dot.');
  if (name.endsWith('.')) throw badRequest('INVALID_NAME', 'Names can\'t end with a dot.');
  if (RESERVED.test(name)) throw badRequest('INVALID_NAME', `“${name}” is reserved by Windows.`);
  return name;
}

/** Create a category (no parent), sub-category or album, on disk and in the DB. */
export function createFolder(lib: OpenLibrary, input: { parentId: number | null; kind: FolderKind; name: string }): FolderCard {
  const { db } = lib;
  const name = validateFolderName(input.name);
  let parent: FolderRow | undefined;
  if (input.parentId !== null) {
    parent = new FolderTree(lib).byId.get(input.parentId);
    if (!parent) throw notFound('FOLDER_NOT_FOUND', 'The parent folder no longer exists.');
  }

  // Structural rules (technical doc §6.2).
  if (input.kind === 'inbox') throw badRequest('INVALID_KIND', 'There is only one Inbox.');
  if (!parent && input.kind !== 'category') throw badRequest('INVALID_KIND', 'Only categories can be created at the top level.');
  if (parent && input.kind === 'category') throw badRequest('INVALID_KIND', 'A category inside a folder is a sub-category.');
  if (parent && (parent.kind === 'album' || parent.kind === 'inbox')) throw badRequest('INVALID_PARENT', 'Albums hold only images.');

  const relPath = parent ? `${parent.rel_path}/${name}` : name;
  const abs = toAbsolute(lib.moduleRoot('images'), relPath);
  const taken = db.prepare("SELECT 1 FROM folders WHERE module = 'images' AND rel_path = ?").get(relPath);
  if (taken || fs.existsSync(abs)) throw conflict('NAME_TAKEN', `“${name}” already exists here.`);

  // Disk first, then the DB; undo the disk change if the DB part fails (technical doc §7.3).
  const uuid = randomUUID();
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
