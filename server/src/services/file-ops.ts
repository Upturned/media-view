import fs from 'node:fs';
import path from 'node:path';
import type { FileDetail } from '@media-view/shared';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { expectChange } from '../lib/expected.ts';
import { log } from '../lib/log.ts';
import { splitExt, uniqueName, validateName } from '../lib/names.ts';
import { toAbsolute } from '../lib/paths.ts';
import { fileDetail } from './files.ts';
import { liveFolder, MAX_DESCRIPTION } from './folders.ts';
import type { OpenLibrary } from './library.ts';
import { recycleFiles } from './recycle.ts';

/** Moving, copying and renaming images (technical doc §8.4, §7.3; design M3 · 01–03). */

export type ClashPolicy = 'keep-both' | 'replace' | 'skip';

interface OpFile {
  id: number;
  rel_path: string;
  filename: string;
  ext: string;
  folder_id: number;
  favorited: number;
  size: number;
  hash: string | null;
  width: number | null;
  height: number | null;
  description: string | null;
}

export interface TransferResult {
  done: number;
  /** Saved under another name to avoid a clash. */
  renamed: { id: number; from: string; to: string }[];
  skipped: { id: number; name: string; reason: string }[];
  /** Existing images replaced (sent to the Recycle Bin). */
  replaced: number;
}

export interface MoveResult extends TransferResult {
  /** Where each moved image came from: feed it back to undo the move. */
  undo: { id: number; folderId: number; filename: string }[];
}

function liveFiles(lib: OpenLibrary, ids: number[]): OpFile[] {
  const get = lib.db.prepare(
    `SELECT id, rel_path, filename, ext, folder_id, favorited, size, hash, width, height, description
     FROM files WHERE id = ? AND recycled = 0 AND missing_since IS NULL AND media_type = 'image'`,
  );
  return ids.map((id) => get.get(id) as OpFile | undefined).filter((f): f is OpFile => !!f);
}

/** An album or the Inbox (null = the Inbox): the only places images can live. */
export function imageTarget(lib: OpenLibrary, id: number | null) {
  const target = id === null
    ? lib.db.prepare("SELECT id FROM folders WHERE module = 'images' AND kind = 'inbox'").pluck().get() as number
    : id;
  const f = liveFolder(lib, target);
  if (f.kind !== 'album' && f.kind !== 'inbox') throw badRequest('NOT_AN_ALBUM', 'Images can only go into an album or the Inbox.');
  return f;
}

export function categoryIdOf(lib: OpenLibrary, relPath: string): number {
  return lib.db.prepare("SELECT id FROM folders WHERE module = 'images' AND parent_id IS NULL AND rel_path = ? AND recycled = 0")
    .pluck().get(relPath.split('/')[0]) as number;
}

/** The live image already at a path, if any. */
function rowAt(lib: OpenLibrary, relPath: string): { id: number; favorited: number } | undefined {
  return lib.db.prepare("SELECT id, favorited FROM files WHERE media_type = 'image' AND rel_path = ? AND recycled = 0")
    .get(relPath) as { id: number; favorited: number } | undefined;
}

/**
 * Decide the name an image gets in `dir` under a clash policy. Returns null to skip.
 * Replace sends the existing image to the Recycle Bin — nothing is overwritten for good.
 */
function resolveName(
  lib: OpenLibrary,
  dirRel: string,
  wanted: string,
  policy: ClashPolicy,
  taken: Set<string>,
  result: TransferResult,
  fileId: number,
): string | null {
  const dirAbs = toAbsolute(lib.moduleRoot('images'), dirRel);
  const free = !taken.has(wanted.toLowerCase()) && !fs.existsSync(path.join(dirAbs, wanted));
  if (free) {
    taken.add(wanted.toLowerCase());
    return wanted;
  }
  if (policy === 'skip') {
    result.skipped.push({ id: fileId, name: wanted, reason: `“${wanted}” already exists there.` });
    return null;
  }
  if (policy === 'replace') {
    const existing = rowAt(lib, `${dirRel}/${wanted}`);
    if (existing && !existing.favorited && !taken.has(wanted.toLowerCase())) {
      recycleFiles(lib, [existing.id]);
      result.replaced++;
      taken.add(wanted.toLowerCase());
      return wanted;
    }
    // A starred image (or a file the app doesn't know) is never replaced: keep both instead.
  }
  const { base, ext } = splitExt(wanted);
  const name = uniqueName(dirAbs, base, ext, taken);
  result.renamed.push({ id: fileId, from: wanted, to: name });
  return name;
}

/** Move images into an album (or the Inbox). Tags, stars and collections stay attached. */
export function moveFiles(lib: OpenLibrary, ids: number[], targetId: number | null, policy: ClashPolicy = 'keep-both', names?: Map<number, string>): MoveResult {
  const target = imageTarget(lib, targetId);
  const root = lib.moduleRoot('images');
  const categoryId = categoryIdOf(lib, target.rel_path);
  const result: MoveResult = { done: 0, renamed: [], skipped: [], replaced: 0, undo: [] };
  const taken = new Set<string>();
  const update = lib.db.prepare('UPDATE files SET rel_path = ?, filename = ?, folder_id = ?, category_id = ? WHERE id = ?');

  for (const f of liveFiles(lib, ids)) {
    const wanted = names?.get(f.id) ?? f.filename;
    if (f.rel_path.toLowerCase() === `${target.rel_path}/${wanted}`.toLowerCase()) {
      result.skipped.push({ id: f.id, name: f.filename, reason: 'Already there.' });
      continue;
    }
    const name = resolveName(lib, target.rel_path, wanted, policy, taken, result, f.id);
    if (!name) continue;
    const from = toAbsolute(root, f.rel_path);
    const to = toAbsolute(root, `${target.rel_path}/${name}`);
    expectChange(from, to);
    fs.renameSync(from, to);
    try {
      update.run(`${target.rel_path}/${name}`, name, target.id, categoryId, f.id);
    } catch (err) {
      fs.renameSync(to, from);
      throw err;
    }
    result.undo.push({ id: f.id, folderId: f.folder_id, filename: f.filename });
    result.done++;
  }

  if (result.done > 0) {
    log('info', 'files', 'move', { ids, to: target.rel_path, done: result.done, renamed: result.renamed.length, replaced: result.replaced });
    emit({ type: 'files-changed' });
    emit({ type: 'folders-changed' });
  }
  return result;
}

/** Put moved images back where they were (the toast's Undo). Clashes keep both. */
export function undoMove(lib: OpenLibrary, items: { id: number; folderId: number; filename: string }[]): TransferResult {
  const total: TransferResult = { done: 0, renamed: [], skipped: [], replaced: 0 };
  const byFolder = new Map<number, { id: number; filename: string }[]>();
  for (const it of items) byFolder.set(it.folderId, [...(byFolder.get(it.folderId) ?? []), it]);
  for (const [folderId, group] of byFolder) {
    const r = moveFiles(lib, group.map((g) => g.id), folderId, 'keep-both', new Map(group.map((g) => [g.id, g.filename])));
    total.done += r.done;
    total.renamed.push(...r.renamed);
    total.skipped.push(...r.skipped);
  }
  return total;
}

/** Copy images into an album: each copy is a new image with a new id; collections don't follow. */
export async function copyFiles(lib: OpenLibrary, ids: number[], targetId: number | null, policy: ClashPolicy = 'keep-both'): Promise<TransferResult & { ids: number[] }> {
  const target = imageTarget(lib, targetId);
  const root = lib.moduleRoot('images');
  const categoryId = categoryIdOf(lib, target.rel_path);
  const result = { done: 0, renamed: [], skipped: [], replaced: 0, ids: [] as number[] } as TransferResult & { ids: number[] };
  const taken = new Set<string>();
  const insert = lib.db.prepare(
    `INSERT INTO files (media_type, folder_id, category_id, filename, rel_path, ext, size, mtime, hash, width, height, description, added_at)
     VALUES ('image', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const f of liveFiles(lib, ids)) {
    const name = resolveName(lib, target.rel_path, f.filename, policy, taken, result, f.id);
    if (!name) continue;
    const to = toAbsolute(root, `${target.rel_path}/${name}`);
    expectChange(to);
    await fs.promises.copyFile(toAbsolute(root, f.rel_path), to, fs.constants.COPYFILE_EXCL);
    const st = fs.statSync(to);
    try {
      const id = insert.run(
        target.id, categoryId, name, `${target.rel_path}/${name}`, f.ext, st.size, Math.floor(st.mtimeMs),
        f.hash, f.width, f.height, f.description, Date.now(),
      ).lastInsertRowid as number;
      result.ids.push(id);
    } catch (err) {
      fs.rmSync(to, { force: true });
      throw err;
    }
    result.done++;
  }

  if (result.done > 0) {
    log('info', 'files', 'copy', { ids, to: target.rel_path, done: result.done });
    emit({ type: 'files-changed' });
    emit({ type: 'folders-changed' });
  }
  return result;
}

/** Rename one image. The extension never changes; a name already taken is an error. */
export function renameFile(lib: OpenLibrary, id: number, rawBase: string): FileDetail {
  const [f] = liveFiles(lib, [id]);
  if (!f) throw notFound('FILE_NOT_FOUND', 'This image no longer exists.');
  const base = validateName(rawBase);
  const { ext } = splitExt(f.filename);
  const name = base + ext;
  if (name === f.filename) return fileDetail(lib, id);

  const dirRel = f.rel_path.slice(0, f.rel_path.lastIndexOf('/'));
  const root = lib.moduleRoot('images');
  const to = toAbsolute(root, `${dirRel}/${name}`);
  const caseOnly = name.toLowerCase() === f.filename.toLowerCase();
  if (!caseOnly && fs.existsSync(to)) throw conflict('NAME_TAKEN', `“${name}” already exists in this album.`);

  const from = toAbsolute(root, f.rel_path);
  expectChange(from, to);
  fs.renameSync(from, to);
  lib.db.prepare('UPDATE files SET rel_path = ?, filename = ? WHERE id = ?').run(`${dirRel}/${name}`, name, id);
  emit({ type: 'files-changed' });
  return fileDetail(lib, id);
}

/**
 * Bulk rename (design M3 · 03): `#` is the number (from `start`, padded to `digits`), `*` the
 * original name. Images are numbered in the order given. Every new name must be unique in its folder.
 */
export function bulkRenameNames(files: { filename: string }[], pattern: string, start: number, digits: number): string[] {
  return files.map((f, i) => {
    const { base, ext } = splitExt(f.filename);
    const num = String(start + i).padStart(digits, '0');
    return pattern.split('#').join(num).split('*').join(base).trim() + ext;
  });
}

export function bulkRename(lib: OpenLibrary, ids: number[], pattern: string, start: number, digits: number): { renamed: number } {
  const files = liveFiles(lib, ids);
  if (files.length === 0) return { renamed: 0 };
  const names = bulkRenameNames(files, pattern, start, digits);
  const root = lib.moduleRoot('images');

  // Validate everything before touching the disk.
  const finalPaths = new Set<string>();
  const ours = new Set(files.map((f) => f.rel_path.toLowerCase()));
  files.forEach((f, i) => {
    const name = names[i]!;
    validateName(splitExt(name).base);
    const dirRel = f.rel_path.slice(0, f.rel_path.lastIndexOf('/'));
    const rel = `${dirRel}/${name}`.toLowerCase();
    if (finalPaths.has(rel)) throw conflict('NAME_CONFLICTS', `Two images would both be named “${name}”. Every name must be unique in the album.`);
    finalPaths.add(rel);
    if (!ours.has(rel) && fs.existsSync(toAbsolute(root, `${dirRel}/${name}`))) {
      throw conflict('NAME_CONFLICTS', `“${name}” already exists in the album.`);
    }
  });

  // Two phases, so swaps (a → b, b → a) work: first to temporary names, then to the final ones.
  const changing = files.map((f, i) => ({ f, name: names[i]!, dirRel: f.rel_path.slice(0, f.rel_path.lastIndexOf('/')) }))
    .filter((x) => x.name !== x.f.filename);
  const temp = (x: (typeof changing)[number]) => toAbsolute(root, `${x.dirRel}/~mv-rename-${x.f.id}${splitExt(x.f.filename).ext}`);
  for (const x of changing) {
    expectChange(toAbsolute(root, x.f.rel_path), temp(x), toAbsolute(root, `${x.dirRel}/${x.name}`));
    fs.renameSync(toAbsolute(root, x.f.rel_path), temp(x));
  }
  const update = lib.db.prepare('UPDATE files SET rel_path = ?, filename = ? WHERE id = ?');
  lib.db.transaction(() => {
    // The DB's paths are unique too: park the rows on their temporary names first.
    for (const x of changing) update.run(`${x.dirRel}/~mv-rename-${x.f.id}${splitExt(x.f.filename).ext}`, x.f.filename, x.f.id);
    for (const x of changing) {
      fs.renameSync(temp(x), toAbsolute(root, `${x.dirRel}/${x.name}`));
      update.run(`${x.dirRel}/${x.name}`, x.name, x.f.id);
    }
  })();

  log('info', 'files', 'bulk rename', { ids, pattern, start, digits, renamed: changing.length });
  emit({ type: 'files-changed' });
  return { renamed: changing.length };
}

export function setFileDescription(lib: OpenLibrary, id: number, text: string): FileDetail {
  const [f] = liveFiles(lib, [id]);
  if (!f) throw notFound('FILE_NOT_FOUND', 'This image no longer exists.');
  const value = text.trim();
  if (value.length > MAX_DESCRIPTION) throw badRequest('TOO_LONG', `Descriptions can be up to ${MAX_DESCRIPTION} characters.`);
  lib.db.prepare('UPDATE files SET description = ? WHERE id = ?').run(value || null, id);
  emit({ type: 'files-changed' });
  return fileDetail(lib, id);
}
