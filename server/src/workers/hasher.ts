import { hashFile } from '../lib/hash.ts';
import { log } from '../lib/log.ts';
import { toAbsolute } from '../lib/paths.ts';
import { refreshDuplicates } from '../services/issues.ts';
import type { OpenLibrary } from '../services/library.ts';
import { adoptTempThumbnail, queueBacklog } from '../services/thumbnails.ts';

/**
 * Background hashing (technical doc §8.2): files are usable before they're hashed; only move and
 * duplicate detection wait for it. Walks unhashed files by ascending id with bounded concurrency.
 */

const CONCURRENCY = 2;
const BATCH = 64;

let owner: OpenLibrary | null = null;
let running = false;
let again = false;

export function startHasher(lib: OpenLibrary): void {
  owner = lib;
  kickHasher();
}

export function stopHasher(): void {
  owner = null;
}

/** Hash whatever is unhashed; safe to call any time (runs once, re-runs if kicked meanwhile). */
export function kickHasher(): void {
  const lib = owner;
  if (!lib) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  void run(lib).finally(() => {
    running = false;
    if (again && owner === lib) {
      again = false;
      kickHasher();
    }
  });
}

export function pendingHashes(lib: OpenLibrary): number {
  return lib.db.prepare(
    "SELECT COUNT(*) FROM files WHERE hash IS NULL AND missing_since IS NULL AND recycled = 0 AND media_type = 'image'",
  ).pluck().get() as number;
}

async function run(lib: OpenLibrary): Promise<void> {
  try {
    const hashed = await hashPending(lib, () => owner === lib);
    if (owner !== lib) return;
    if (hashed > 0) log('info', 'hasher', 'hashing finished', { hashed });
    await queueBacklog(lib);
  } catch (err) {
    if (owner === lib) log('error', 'hasher', 'hashing failed', { message: (err as Error).message });
  }
}

/** Hash every unhashed file while `keepGoing()`; refreshes duplicate issues. Returns how many were hashed. */
export async function hashPending(lib: OpenLibrary, keepGoing: () => boolean = () => true): Promise<number> {
  const root = lib.moduleRoot('images');
  const select = lib.db.prepare(
    `SELECT id, rel_path, mtime FROM files
     WHERE id > ? AND hash IS NULL AND missing_since IS NULL AND recycled = 0 AND media_type = 'image'
     ORDER BY id LIMIT ?`,
  );
  // Only store the hash if the file didn't change while it was being read.
  const store = lib.db.prepare('UPDATE files SET hash = ? WHERE id = ? AND hash IS NULL AND mtime = ?');
  let lastId = 0;
  let hashed = 0;

  while (keepGoing()) {
    const batch = select.all(lastId, BATCH) as { id: number; rel_path: string; mtime: number }[];
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1]!.id;
    for (let i = 0; i < batch.length && keepGoing(); i += CONCURRENCY) {
      await Promise.all(batch.slice(i, i + CONCURRENCY).map(async (f) => {
        try {
          const hash = await hashFile(toAbsolute(root, f.rel_path));
          if (!keepGoing()) return;
          if (store.run(hash, f.id, f.mtime).changes > 0) {
            hashed++;
            adoptTempThumbnail(lib, f.id, hash);
          }
        } catch {
          // Vanished or locked: the next scan will sort it out.
        }
      }));
    }
  }
  if (hashed > 0 && keepGoing()) refreshDuplicates(lib.db);
  return hashed;
}
