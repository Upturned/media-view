import fs from 'node:fs/promises';
import path from 'node:path';
import { MARKER_NAMES, readMarker, type Marker } from './markers.ts';
import { toDbPath } from './paths.ts';

/** Snapshot of a module root on disk (reconciliation pass 1, technical doc §7.2). */

export interface DiskDir {
  relPath: string;
  marker: Marker | null;
}

export interface DiskFile {
  relPath: string;
  size: number;
  mtime: number;
  /** Creation time; used as `added_at` for files found on disk. */
  birthtime: number;
}

export interface DiskSnapshot {
  dirs: DiskDir[];
  files: DiskFile[];
}

const STAT_CONCURRENCY = 32;

/**
 * Walk `root` recursively. Hidden entries (dot-names) are skipped, except the known marker files,
 * which are read to identify each directory. Symbolic links are never followed.
 */
export async function walk(root: string): Promise<DiskSnapshot> {
  const dirs: DiskDir[] = [];
  const files: DiskFile[] = [];
  const pendingFiles: { abs: string; rel: string }[] = [];

  const queue: string[] = [''];
  while (queue.length > 0) {
    const rel = queue.shift()!;
    const abs = rel ? path.join(root, ...rel.split('/')) : root;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      continue; // vanished or unreadable while walking
    }
    if (rel) {
      const hasMarker = entries.some((e) => e.isFile() && MARKER_NAMES.has(e.name));
      dirs.push({ relPath: rel, marker: hasMarker ? readMarker(abs) : null });
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const childRel = toDbPath(rel ? `${rel}/${e.name}` : e.name);
      if (e.isDirectory()) queue.push(childRel);
      else if (e.isFile()) pendingFiles.push({ abs: path.join(abs, e.name), rel: childRel });
    }
  }

  for (let i = 0; i < pendingFiles.length; i += STAT_CONCURRENCY) {
    const batch = pendingFiles.slice(i, i + STAT_CONCURRENCY);
    const stats = await Promise.all(batch.map((f) => fs.stat(f.abs).catch(() => null)));
    stats.forEach((st, j) => {
      if (!st) return;
      files.push({
        relPath: batch[j]!.rel,
        size: st.size,
        mtime: Math.floor(st.mtimeMs),
        birthtime: Math.floor(st.birthtimeMs || st.mtimeMs),
      });
    });
  }

  return { dirs, files };
}
