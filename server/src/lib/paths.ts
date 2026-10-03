import path from 'node:path';

/**
 * The only place that converts between DB paths and OS paths.
 * DB paths are relative to the module root, use '/', and are NFC-normalized.
 */

export const DATA_DIR = '.mediaview';

export const MODULE_ROOTS = {
  images: 'Images',
  videos: 'Videos',
  audio: 'Audio',
  texts: 'Texts',
} as const;

export function toDbPath(relative: string): string {
  return relative.normalize('NFC').split(/[\\/]+/).filter(Boolean).join('/');
}

/** Absolute OS path for a DB path inside a module root. Throws if it would escape the root. */
export function toAbsolute(moduleRoot: string, dbPath: string): string {
  const abs = path.resolve(moduleRoot, ...dbPath.split('/'));
  assertInside(moduleRoot, abs);
  return abs;
}

export function assertInside(root: string, candidate: string): void {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`path escapes library root: ${candidate}`);
  }
}

/**
 * SQL condition matching every row under `prefix` (not the prefix itself), as a range:
 * `prefix/` ≤ path < `prefix0` ('0' is the character right after '/'). The column's NOCASE
 * collation applies and the (…, rel_path) index is used.
 * Never use LIKE for paths: `_` and `%` are wildcards there and `_` is common in file names.
 */
export function underPrefix(column: string, prefix: string): { sql: string; params: string[] } {
  return { sql: `(${column} >= ? AND ${column} < ?)`, params: [prefix + '/', prefix + '0'] };
}

export function parentPath(relPath: string): string {
  const i = relPath.lastIndexOf('/');
  return i < 0 ? '' : relPath.slice(0, i);
}

export function baseName(relPath: string): string {
  return relPath.slice(relPath.lastIndexOf('/') + 1);
}

export function extension(name: string): string {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase();
}

/** Escape a user text term for `LIKE … ESCAPE '\'`. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => '\\' + c);
}
