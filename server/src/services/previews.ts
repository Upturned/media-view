import fs from 'node:fs';
import path from 'node:path';
import { emit } from '../lib/events.ts';
import { openImage } from '../lib/image.ts';
import { log } from '../lib/log.ts';
import { DATA_DIR } from '../lib/paths.ts';
import { absPath, type OpenLibrary } from './library.ts';

/**
 * Viewer copies of images browsers can't show (TIFF; technical doc §9): WebP, longest side up to
 * 8192 px, content-addressed by hash like thumbnails. Made ahead of time in the background once
 * files are hashed, one at a time, with the progress in the top bar; the viewer has one made right
 * away when it isn't ready yet.
 */

export const PREVIEW_MAX = 8192;
const QUALITY = 90;

export const needsPreview = (ext: string) => ext === 'tif' || ext === 'tiff';

interface PreviewSource {
  id: number;
  rel_path: string;
  hash: string | null;
  ext: string;
}

export function previewDir(lib: OpenLibrary): string {
  return path.join(lib.root, DATA_DIR, 'previews');
}

export function previewPath(lib: OpenLibrary, file: { id: number; hash: string | null }): string {
  return file.hash
    ? path.join(previewDir(lib), file.hash.slice(0, 2), `${file.hash}.webp`)
    : path.join(previewDir(lib), 'tmp', `${file.id}.webp`);
}

const inFlight = new Map<string, Promise<string>>();

function convert(lib: OpenLibrary, file: PreviewSource): Promise<string> {
  const target = previewPath(lib, file);
  const existing = inFlight.get(target);
  if (existing) return existing;
  const job = (async () => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.part`;
    await openImage(absPath(lib, file.rel_path), file.ext)
      .rotate()
      .resize({ width: PREVIEW_MAX, height: PREVIEW_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(tmp);
    fs.renameSync(tmp, target);
    return target;
  })().finally(() => inFlight.delete(target));
  inFlight.set(target, job);
  return job;
}

/** The viewer copy of a file, made now if it isn't ready. */
export async function getPreview(lib: OpenLibrary, file: PreviewSource): Promise<string> {
  const target = previewPath(lib, file);
  if (fs.existsSync(target)) return target;
  if (file.hash) {
    const temp = previewPath(lib, { id: file.id, hash: null });
    if (fs.existsSync(temp)) adoptTempPreview(lib, file.id, file.hash);
    if (fs.existsSync(target)) return target;
  }
  return convert(lib, file);
}

/** Once a file is hashed, a copy made before (keyed by id) becomes the content-addressed one. */
export function adoptTempPreview(lib: OpenLibrary, id: number, hash: string): void {
  const temp = previewPath(lib, { id, hash: null });
  if (!fs.existsSync(temp)) return;
  const target = previewPath(lib, { id, hash });
  try {
    if (fs.existsSync(target)) fs.rmSync(temp, { force: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(temp, target);
    }
  } catch {
    // adopted meanwhile
  }
}

// ─── Ahead of time ───────────────────────────────────────────────────────────

let owner: OpenLibrary | null = null;
let running = false;
let again = false;
let progress: { done: number; total: number } | null = null;

export function startPreviews(lib: OpenLibrary): void {
  owner = lib;
}

export function stopPreviews(): void {
  owner = null;
}

/** Viewer copies being made in the background: how many of how many, or null. */
export function convertingStatus(): { done: number; total: number } | null {
  return progress && { ...progress };
}

/** Make the copies that are missing; safe to call any time (runs once, re-runs if kicked meanwhile). */
export function kickPreviews(lib: OpenLibrary): Promise<void> {
  if (owner !== lib) return Promise.resolve();
  if (running) {
    again = true;
    return Promise.resolve();
  }
  running = true;
  return run(lib).finally(() => {
    running = false;
    if (again && owner === lib) {
      again = false;
      void kickPreviews(lib);
    }
  });
}

async function run(lib: OpenLibrary): Promise<void> {
  const rows = lib.db.prepare(
    `SELECT id, rel_path, hash, ext FROM files
     WHERE ext IN ('tif', 'tiff') AND hash IS NOT NULL AND recycled = 0 AND missing_since IS NULL
     ORDER BY id`,
  ).all() as PreviewSource[];
  const todo = rows.filter((r) => !fs.existsSync(previewPath(lib, r)));
  if (todo.length === 0) return;

  progress = { done: 0, total: todo.length };
  let lastEmit = 0;
  const report = (force = false) => {
    if (!force && Date.now() - lastEmit < 1000) return;
    lastEmit = Date.now();
    emit({ type: 'converting', ...(progress ?? { done: 0, total: 0 }) });
  };
  report(true);
  let failed = 0;
  for (const r of todo) {
    if (owner !== lib) break;
    try {
      await convert(lib, r);
    } catch (err) {
      // The thumbnail flags an unreadable file; nothing more to say here.
      failed++;
      log('warn', 'previews', 'could not make a viewer copy', { path: r.rel_path, message: (err as Error).message });
    }
    progress.done++;
    report();
  }
  log('info', 'previews', 'viewer copies made', { made: progress.done - failed, failed });
  progress = null;
  emit({ type: 'converting', done: 0, total: 0 });
}
