import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isImageFile } from '@media-view/shared';
import sharp from 'sharp';
import { badRequest } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { expectChange } from '../lib/expected.ts';
import { log } from '../lib/log.ts';
import { sanitizeName, splitExt, uniqueName } from '../lib/names.ts';
import { extension, toAbsolute } from '../lib/paths.ts';
import { categoryIdOf, imageTarget } from './file-ops.ts';
import { tempDir, type OpenLibrary } from './library.ts';

/**
 * Importing images into an album or the Inbox (technical doc §8.3; design M3 · 06). One file per
 * call, so the client drives progress and can cancel between files.
 */

export interface ImportResult {
  name: string;
  status: 'copied' | 'renamed' | 'skipped' | 'rejected';
  /** For renamed: the name it was saved under. */
  savedAs?: string;
  reason?: string;
  fileId?: number;
  size?: number;
}

const VIDEO = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg']);
const AUDIO = new Set(['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'opus']);
const UNSUPPORTED_IMAGES = new Set(['psd', 'tif', 'tiff', 'bmp', 'heic', 'heif', 'ico', 'raw', 'cr2', 'nef', 'arw', 'dng', 'xcf', 'kra', 'clip']);
const SUPPORTED = 'Supported: JPG, PNG, GIF, WebP, SVG, AVIF, JFIF.';

/** Why a file can't be imported, from its name alone; null if it can be tried. */
export function rejectionByName(name: string): string | null {
  if (isImageFile(name)) return null;
  const ext = extension(name);
  if (VIDEO.has(ext)) return 'Video file — not imported. Videos will have their own module.';
  if (AUDIO.has(ext)) return 'Audio file — not imported. Audio will have its own module.';
  if (UNSUPPORTED_IMAGES.has(ext)) return `Unsupported format (${ext.toUpperCase()}). ${SUPPORTED}`;
  return 'Not an image.';
}

/** Import one file from a stream (drag and drop) into `targetId` (null = the Inbox). */
export async function importStream(lib: OpenLibrary, targetId: number | null, rawName: string, body: Readable): Promise<ImportResult> {
  const name = sanitizeName(path.basename(rawName));
  const rejected = rejectionByName(name);
  if (rejected) {
    body.resume(); // drain
    return { name, status: 'rejected', reason: rejected };
  }
  const target = imageTarget(lib, targetId);
  const temp = path.join(tempDir(lib), `${randomUUID()}.${extension(name)}`);
  const hash = createHash('sha256');
  try {
    await pipeline(
      body,
      new Transform({ transform(chunk, _enc, cb) { hash.update(chunk); cb(null, chunk); } }),
      fs.createWriteStream(temp),
    );
  } catch {
    fs.rmSync(temp, { force: true });
    return { name, status: 'rejected', reason: 'The upload was interrupted.' };
  }
  return place(lib, target, name, temp, hash.digest('hex'));
}

/** Import one file from a path on disk (the file picker). The original is left untouched. */
export async function importPath(lib: OpenLibrary, targetId: number | null, source: string): Promise<ImportResult> {
  if (!path.isAbsolute(source)) throw badRequest('INVALID_PATH', 'The path must be absolute.');
  const name = sanitizeName(path.basename(source));
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return { name, status: 'rejected', reason: 'The file no longer exists.' };
  return importStream(lib, targetId, name, fs.createReadStream(source));
}

async function place(lib: OpenLibrary, target: ReturnType<typeof imageTarget>, name: string, temp: string, hash: string): Promise<ImportResult> {
  const { db } = lib;
  const done = (r: ImportResult) => {
    fs.rmSync(temp, { force: true });
    return r;
  };

  // The same image is already in this album: nothing to do (elsewhere, a copy is a normal duplicate).
  const same = db.prepare('SELECT filename FROM files WHERE folder_id = ? AND hash = ? AND recycled = 0 AND missing_since IS NULL')
    .pluck().get(target.id, hash) as string | undefined;
  if (same) return done({ name, status: 'skipped', reason: `Identical image already in this album${same !== name ? ` (“${same}”)` : ''} — skipped.` });

  // It must really be an image.
  let width: number | null = null;
  let height: number | null = null;
  const ext = extension(name);
  try {
    if (ext === 'svg') {
      const head = fs.readFileSync(temp, 'utf8').slice(0, 4096);
      if (!/<svg[\s>]/i.test(head)) throw new Error('not svg');
    } else {
      const meta = await sharp(temp, { failOn: 'none' }).metadata();
      if (!meta.width || !meta.height) throw new Error('no size');
      const rotated = (meta.orientation ?? 1) >= 5;
      width = rotated ? meta.height : meta.width;
      height = rotated ? meta.width : meta.height;
    }
  } catch {
    return done({ name, status: 'rejected', reason: 'Couldn’t read the file — it may be damaged or still downloading.' });
  }

  const dir = toAbsolute(lib.moduleRoot('images'), target.rel_path);
  const { base, ext: dotExt } = splitExt(name);
  const finalName = uniqueName(dir, base, dotExt);
  const finalPath = path.join(dir, finalName);
  expectChange(finalPath);
  fs.renameSync(temp, finalPath);
  const st = fs.statSync(finalPath);
  const rel = `${target.rel_path}/${finalName}`;
  const fileId = db.prepare(
    `INSERT INTO files (media_type, folder_id, category_id, filename, rel_path, ext, size, mtime, hash, width, height, added_at)
     VALUES ('image', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(target.id, categoryIdOf(lib, target.rel_path), finalName, rel, ext, st.size, Math.floor(st.mtimeMs), hash, width, height, Date.now())
    .lastInsertRowid as number;

  emit({ type: 'files-changed' });
  emit({ type: 'folders-changed' });
  return finalName === name
    ? { name, status: 'copied', fileId, size: st.size }
    : { name, status: 'renamed', savedAs: finalName, reason: `Name taken — saved as ${finalName}`, fileId, size: st.size };
}

/** Log the summary of an import the client finished (or cancelled). */
export function logImport(summary: { target: string; copied: number; renamed: number; skipped: number; rejected: number; cancelled: boolean }): void {
  log('info', 'import', 'import finished', summary);
}
