import fs from 'node:fs';
import path from 'node:path';
import type { FileDetail } from '@media-view/shared';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { expectChange } from '../lib/expected.ts';
import { log } from '../lib/log.ts';
import { splitExt, uniqueName, validateName } from '../lib/names.ts';
import { toAbsolute } from '../lib/paths.ts';
import { renameWithRetry } from '../lib/rename.ts';
import { fileDetail } from './files.ts';
import { liveFolder, MAX_DESCRIPTION } from './folders.ts';
import { scheduleDuplicateRefresh } from './issues.ts';
import type { OpenLibrary } from './library.ts';
import { STARRED_ANY } from './profiles.ts';
import { recycleFiles, restore } from './recycle.ts';
import { copyFileTags } from './tags.ts';

/** Moving, copying and renaming images (technical doc §8.4, §7.3; design M3 · 01–03). */

export type ClashPolicy = 'keep-both' | 'replace' | 'skip';

interface OpFile {
  id: number;
  rel_path: string;
  filename: string;
  ext: string;
  folder_id: number;
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
  /** `inUse`: another program had it open, so Windows refused (a retry may work). */
  skipped: { id: number; name: string; reason: string; inUse?: true }[];
  /** Existing images replaced (sent to the Recycle Bin). */
  replaced: number;
}

export interface MoveResult extends TransferResult {
  /** Where each moved image came from: feed it back to undo the move. */
  undo: { id: number; folderId: number; filename: string }[];
}

function liveFiles(lib: OpenLibrary, ids: number[]): OpFile[] {
  const get = lib.db.prepare(
    `SELECT id, rel_path, filename, ext, folder_id, size, hash, width, height, description
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

/** The live image already at a path, if any; `favorited`: starred by anyone (docs/profiles.md §3.1). */
function rowAt(lib: OpenLibrary, relPath: string): { id: number; favorited: number } | undefined {
  return lib.db.prepare(`SELECT f.id, ${STARRED_ANY} AS favorited FROM files f WHERE f.media_type = 'image' AND f.rel_path = ? AND f.recycled = 0`)
    .get(relPath) as { id: number; favorited: number } | undefined;
}

/**
 * Decide the name an image gets in `dir` under a clash policy. Returns null to skip.
 * Replace names the image it would replace (`replaces`); the caller recycles it with replaceWith().
 */
function resolveName(
  lib: OpenLibrary,
  dirRel: string,
  wanted: string,
  policy: ClashPolicy,
  taken: Set<string>,
  result: TransferResult,
  fileId: number,
): { name: string; replaces?: number } | null {
  const dirAbs = toAbsolute(lib.moduleRoot('images'), dirRel);
  const free = !taken.has(wanted.toLowerCase()) && !fs.existsSync(path.join(dirAbs, wanted));
  if (free) {
    taken.add(wanted.toLowerCase());
    return { name: wanted };
  }
  if (policy === 'skip') {
    result.skipped.push({ id: fileId, name: wanted, reason: `“${wanted}” already exists there.` });
    return null;
  }
  if (policy === 'replace') {
    const existing = rowAt(lib, `${dirRel}/${wanted}`);
    if (existing && !existing.favorited && !taken.has(wanted.toLowerCase())) {
      taken.add(wanted.toLowerCase());
      return { name: wanted, replaces: existing.id };
    }
    // A starred image (or a file the app doesn't know) is never replaced: keep both instead.
  }
  const { base, ext } = splitExt(wanted);
  const name = uniqueName(dirAbs, base, ext, taken);
  result.renamed.push({ id: fileId, from: wanted, to: name });
  return { name };
}

/** Where an incoming image waits beside the one it replaces. */
const stagedPath = (root: string, dirRel: string, fileId: number, name: string) =>
  toAbsolute(root, `${dirRel}/~mv-incoming-${fileId}${splitExt(name).ext}`);

/**
 * Replace image `oldId` at `to` with the file staged beside it. The old image goes to the Recycle
 * Bin only once the new one is surely there — nothing is overwritten for good, and nothing is
 * recycled for a file that couldn't come — and it comes back if the last step fails.
 */
function replaceWith(lib: OpenLibrary, oldId: number, staged: string, to: string): void {
  recycleFiles(lib, [oldId]);
  // Starred meanwhile, so it stayed: never overwrite it.
  if (fs.existsSync(to)) throw conflict('NAME_TAKEN', `“${path.basename(to)}” is starred now, so it wasn’t replaced.`);
  try {
    renameWithRetry(staged, to);
  } catch (err) {
    const rid = lib.db.prepare("SELECT id FROM recycle_items WHERE entity = 'file' AND entity_id = ? ORDER BY id DESC").pluck().get(oldId) as number;
    try {
      restore(lib, rid);
    } catch (restoreErr) {
      log('error', 'files', 'replace: could not restore the replaced image', { id: oldId, error: String(restoreErr) });
    }
    throw err;
  }
}

/** Move images into an album (or the Inbox). Tags, stars and collections stay attached. */
export function moveFiles(lib: OpenLibrary, ids: number[], targetId: number | null, policy: ClashPolicy = 'keep-both', names?: Map<number, string>): MoveResult {
  const target = imageTarget(lib, targetId);
  const root = lib.moduleRoot('images');
  const categoryId = categoryIdOf(lib, target.rel_path);
  const result: MoveResult = { done: 0, renamed: [], skipped: [], replaced: 0, undo: [] };
  const taken = new Set<string>();
  const update = lib.db.prepare('UPDATE files SET rel_path = ?, filename = ?, folder_id = ?, category_id = ? WHERE id = ?');

  try {
    for (const f of liveFiles(lib, ids)) {
      const wanted = names?.get(f.id) ?? f.filename;
      if (f.rel_path.toLowerCase() === `${target.rel_path}/${wanted}`.toLowerCase()) {
        result.skipped.push({ id: f.id, name: f.filename, reason: 'Already there.' });
        continue;
      }
      const pick = resolveName(lib, target.rel_path, wanted, policy, taken, result, f.id);
      if (!pick) continue;
      const { name, replaces } = pick;
      const from = toAbsolute(root, f.rel_path);
      const to = toAbsolute(root, `${target.rel_path}/${name}`);
      const staged = replaces ? stagedPath(root, target.rel_path, f.id, name) : to;
      expectChange(from, staged, to);
      try {
        renameWithRetry(from, staged);
        if (replaces) {
          try {
            replaceWith(lib, replaces, staged, to);
          } catch (err) {
            renameWithRetry(staged, from);
            throw err;
          }
          result.replaced++;
        }
      } catch (err) {
        // One busy file doesn't stop the rest: it stays where it is and is reported.
        if (!(err instanceof AppError && err.code === 'IN_USE')) throw err;
        taken.delete(name.toLowerCase());
        result.skipped.push({ id: f.id, name: f.filename, reason: err.message, inUse: true });
        continue;
      }
      try {
        update.run(`${target.rel_path}/${name}`, name, target.id, categoryId, f.id);
      } catch (err) {
        fs.renameSync(to, from);
        throw err;
      }
      result.undo.push({ id: f.id, folderId: f.folder_id, filename: f.filename });
      result.done++;
    }
  } finally {
    // Also when something else fails partway: what did move must show up in the grid.
    if (result.done > 0) {
      log('info', 'files', 'move', { ids, to: target.rel_path, done: result.done, renamed: result.renamed.length, replaced: result.replaced });
      emit({ type: 'files-changed' });
      emit({ type: 'folders-changed' });
    }
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
/** `copyTags`: the copies get the originals' tags (the Copy dialog's checkbox, on by default). */
export async function copyFiles(lib: OpenLibrary, ids: number[], targetId: number | null, policy: ClashPolicy = 'keep-both', copyTags = true): Promise<TransferResult & { ids: number[] }> {
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
    const pick = resolveName(lib, target.rel_path, f.filename, policy, taken, result, f.id);
    if (!pick) continue;
    const { name, replaces } = pick;
    const to = toAbsolute(root, `${target.rel_path}/${name}`);
    const staged = replaces ? stagedPath(root, target.rel_path, f.id, name) : to;
    expectChange(staged, to);
    await fs.promises.copyFile(toAbsolute(root, f.rel_path), staged, fs.constants.COPYFILE_EXCL);
    if (replaces) {
      try {
        replaceWith(lib, replaces, staged, to);
      } catch (err) {
        fs.rmSync(staged, { force: true });
        throw err;
      }
      result.replaced++;
    }
    const st = fs.statSync(to);
    try {
      const id = insert.run(
        target.id, categoryId, name, `${target.rel_path}/${name}`, f.ext, st.size, Math.floor(st.mtimeMs),
        f.hash, f.width, f.height, f.description, Date.now(),
      ).lastInsertRowid as number;
      result.ids.push(id);
      if (copyTags) copyFileTags(lib.db, f.id, id);
    } catch (err) {
      fs.rmSync(to, { force: true });
      throw err;
    }
    result.done++;
  }

  if (result.done > 0) {
    log('info', 'files', 'copy', { ids, to: target.rel_path, done: result.done });
    scheduleDuplicateRefresh(lib.db); // copies carry the original's hash
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
  renameWithRetry(from, to);
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
  type Change = (typeof changing)[number];
  const original = (x: Change) => toAbsolute(root, x.f.rel_path);
  const temp = (x: Change) => toAbsolute(root, `${x.dirRel}/~mv-rename-${x.f.id}${splitExt(x.f.filename).ext}`);
  const final = (x: Change) => toAbsolute(root, `${x.dirRel}/${x.name}`);

  // If Windows refuses a rename partway, everything already renamed goes back, so the disk matches
  // the database again (left on temporary names, Health would report them as moved outside the app).
  const parked: Change[] = [];
  const placed: Change[] = [];
  const back = (id: number, from: string, to: string) => {
    try {
      renameWithRetry(from, to);
    } catch (err) {
      log('error', 'files', 'bulk rename: could not put a file back', { id, from, to, error: String(err) });
    }
  };
  const putBack = (err: unknown): never => {
    for (const x of placed.reverse()) back(x.f.id, final(x), temp(x));
    for (const x of parked) back(x.f.id, temp(x), original(x));
    throw err;
  };

  for (const x of changing) {
    expectChange(original(x), temp(x), final(x));
    try {
      renameWithRetry(original(x), temp(x));
    } catch (err) {
      putBack(err);
    }
    parked.push(x);
  }
  const update = lib.db.prepare('UPDATE files SET rel_path = ?, filename = ? WHERE id = ?');
  try {
    lib.db.transaction(() => {
      // The DB's paths are unique too: park the rows on their temporary names first.
      for (const x of changing) update.run(`${x.dirRel}/~mv-rename-${x.f.id}${splitExt(x.f.filename).ext}`, x.f.filename, x.f.id);
      for (const x of changing) {
        renameWithRetry(temp(x), final(x));
        placed.push(x);
        update.run(`${x.dirRel}/${x.name}`, x.name, x.f.id);
      }
    })();
  } catch (err) {
    putBack(err); // the transaction rolled back: the rows have their old names again
  }

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
