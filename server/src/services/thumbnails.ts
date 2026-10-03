import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { log } from '../lib/log.ts';
import { DATA_DIR } from '../lib/paths.ts';
import { raiseIssue } from './issues.ts';
import { absPath, type OpenLibrary } from './library.ts';

/**
 * Thumbnails (technical doc §9): longest side 400 px, WebP q80, content-addressed by hash so they
 * survive moves and duplicates share one. Before a file is hashed, a temporary one keyed by id is used.
 */

export const THUMB_SIZE = 400;
const QUALITY = 80;
const CONCURRENCY = Math.max(2, os.cpus().length - 2);

interface ThumbSource {
  id: number;
  rel_path: string;
  hash: string | null;
  ext: string;
}

export const isRaster = (ext: string) => ext !== 'svg';

function thumbDir(lib: OpenLibrary): string {
  return path.join(lib.root, DATA_DIR, 'thumbnails');
}

export function thumbPath(lib: OpenLibrary, file: { id: number; hash: string | null }): string {
  return file.hash
    ? path.join(thumbDir(lib), file.hash.slice(0, 2), `${file.hash}.webp`)
    : path.join(thumbDir(lib), 'tmp', `${file.id}.webp`);
}

// ─── Queue: on-screen requests first, then the background backlog ────────────

type Job = { key: string; run: () => Promise<void> };
const high: Job[] = [];
const low: Job[] = [];
const inFlight = new Map<string, Promise<string>>();
let active = 0;
let queueOwner: OpenLibrary | null = null;

function pump(): void {
  while (active < CONCURRENCY) {
    const job = high.shift() ?? low.shift();
    if (!job) return;
    active++;
    job.run().finally(() => {
      active--;
      pump();
    });
  }
}

function enqueue(lib: OpenLibrary, file: ThumbSource, priority: 'high' | 'low'): Promise<string> {
  const target = thumbPath(lib, file);
  const existing = inFlight.get(target);
  if (existing) {
    // Promote a queued background job when the grid asks for it.
    if (priority === 'high') {
      const i = low.findIndex((j) => j.key === target);
      if (i >= 0) high.push(...low.splice(i, 1));
      pump();
    }
    return existing;
  }
  let resolve!: (p: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => {}); // background jobs may fail with nobody listening
  inFlight.set(target, promise);
  const job: Job = {
    key: target,
    run: async () => {
      try {
        if (queueOwner !== lib) throw new Error('library closed');
        await generate(lib, file, target);
        resolve(target);
      } catch (err) {
        reject(err);
      } finally {
        inFlight.delete(target);
      }
    },
  };
  (priority === 'high' ? high : low).push(job);
  pump();
  return promise;
}

export function startThumbnails(lib: OpenLibrary): void {
  queueOwner = lib;
}

export function stopThumbnails(): void {
  queueOwner = null;
  high.length = 0;
  low.length = 0;
}

// ─── Generation ──────────────────────────────────────────────────────────────

async function generate(lib: OpenLibrary, file: ThumbSource, target: string): Promise<void> {
  const source = absPath(lib, file.rel_path);
  try {
    const meta = await sharp(source, { failOn: 'none' }).metadata();
    // EXIF orientations 5–8 are rotated by 90°: the displayed size is swapped.
    const rotated = (meta.orientation ?? 1) >= 5;
    lib.db.prepare('UPDATE files SET width = ?, height = ? WHERE id = ?')
      .run(rotated ? meta.height : meta.width, rotated ? meta.width : meta.height, file.id);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.part`;
    await sharp(source, { failOn: 'none' })
      .rotate()
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(tmp);
    fs.renameSync(tmp, target);
  } catch (err) {
    if (fs.existsSync(source)) {
      // Has an image extension but isn't a readable image (technical doc §8.1).
      raiseIssue(lib.db, 'wrong_type', `file:${file.id}`, { fileId: file.id, path: file.rel_path, reason: 'unreadable' });
      log('warn', 'thumbnails', 'not a readable image', { path: file.rel_path, message: (err as Error).message });
    }
    throw err;
  }
}

/** Path of the file's thumbnail, generating it now (high priority) if needed. */
export async function getThumbnail(lib: OpenLibrary, file: ThumbSource): Promise<string> {
  const target = thumbPath(lib, file);
  if (fs.existsSync(target)) return target;
  if (file.hash) {
    const temp = thumbPath(lib, { id: file.id, hash: null });
    if (fs.existsSync(temp)) {
      adopt(temp, target);
      return target;
    }
  }
  return enqueue(lib, file, 'high');
}

/** Once a file is hashed, its temporary thumbnail becomes the content-addressed one. */
export function adoptTempThumbnail(lib: OpenLibrary, id: number, hash: string): void {
  const temp = thumbPath(lib, { id, hash: null });
  if (fs.existsSync(temp)) adopt(temp, thumbPath(lib, { id, hash }));
}

function adopt(temp: string, target: string): void {
  try {
    if (fs.existsSync(target)) fs.rmSync(temp, { force: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(temp, target);
    }
  } catch {
    // Another request adopted it first.
  }
}

/** Queue thumbnails for every hashed raster image that doesn't have one yet (low priority). */
export async function queueBacklog(lib: OpenLibrary): Promise<number> {
  const rows = lib.db.prepare(
    `SELECT id, rel_path, hash, ext FROM files
     WHERE media_type = 'image' AND recycled = 0 AND missing_since IS NULL AND hash IS NOT NULL AND ext <> 'svg'`,
  ).all() as ThumbSource[];
  let queued = 0;
  for (let i = 0; i < rows.length; i++) {
    if (queueOwner !== lib) break;
    const r = rows[i]!;
    if (!fs.existsSync(thumbPath(lib, r))) {
      enqueue(lib, r, 'low');
      queued++;
    }
    if (i % 500 === 499) await new Promise((res) => setImmediate(res));
  }
  return queued;
}
