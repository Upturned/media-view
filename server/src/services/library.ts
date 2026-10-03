import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LibraryInfo, ScanStatus } from '@media-view/shared';
import { appDataDir, rememberLibrary } from '../config.ts';
import { openDatabase, type DB } from '../db/connection.ts';
import { migrate } from '../db/migrate.ts';
import { seedDefaults } from '../db/seed.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { log, setLogDir } from '../lib/log.ts';
import { readMarker, writeMarker } from '../lib/markers.ts';
import { DATA_DIR, MODULE_ROOTS, toAbsolute } from '../lib/paths.ts';
import { hide } from '../lib/windows.ts';

/** One open library at a time (technical doc §3, §5.2). */

const FORMAT_VERSION = 1;
const INBOX_NAME = 'Inbox';

interface LibraryMeta {
  id: string;
  formatVersion: number;
  createdAt: number;
}

export interface OpenLibrary {
  root: string;
  meta: LibraryMeta;
  db: DB;
  /** Absolute path of a module root, e.g. `<library>/Images`. */
  moduleRoot(module: keyof typeof MODULE_ROOTS): string;
}

let current: OpenLibrary | null = null;

/** Background workers attach here (set by the server at boot; tests run without them). */
interface LibraryHooks {
  opened(lib: OpenLibrary): void;
  closing(lib: OpenLibrary): void;
}
let hooks: LibraryHooks | null = null;

export function setLibraryHooks(next: LibraryHooks | null): void {
  hooks = next;
}

export function getLibrary(): OpenLibrary | null {
  return current;
}

export function requireLibrary(): OpenLibrary {
  if (!current) throw conflict('NO_LIBRARY', 'No library is open.');
  return current;
}

const dataDir = (root: string) => path.join(root, DATA_DIR);
const metaFile = (root: string) => path.join(dataDir(root), 'library.json');

export function isLibrary(root: string): boolean {
  return fs.existsSync(metaFile(root));
}

function normalizeRoot(input: string): string {
  if (!path.isAbsolute(input)) throw badRequest('INVALID_PATH', 'The library path must be absolute.');
  return path.resolve(input);
}

/** Create a new library in `input` (which may already contain files) and open it. */
export function createLibrary(input: string): OpenLibrary {
  const root = normalizeRoot(input);
  if (isLibrary(root)) throw conflict('ALREADY_LIBRARY', 'This folder is already a library.');
  if (fs.existsSync(root) && !fs.statSync(root).isDirectory()) {
    throw badRequest('NOT_A_FOLDER', 'The selected path is not a folder.');
  }

  fs.mkdirSync(dataDir(root), { recursive: true });
  hide(dataDir(root));
  for (const sub of ['thumbnails', 'recycle-bin', 'logs']) {
    fs.mkdirSync(path.join(dataDir(root), sub), { recursive: true });
  }
  fs.mkdirSync(path.join(root, MODULE_ROOTS.images), { recursive: true });

  const db = openDatabase(path.join(dataDir(root), 'library.db'));
  try {
    migrate(db);
    seedDefaults(db);
  } finally {
    db.close();
  }

  const meta: LibraryMeta = { id: randomUUID(), formatVersion: FORMAT_VERSION, createdAt: Date.now() };
  fs.writeFileSync(metaFile(root), JSON.stringify(meta, null, 2));

  log('info', 'library', 'library created', { path: root });
  return openLibrary(root);
}

/** Open an existing library, closing the current one. */
export function openLibrary(input: string): OpenLibrary {
  const root = normalizeRoot(input);
  if (!fs.existsSync(root)) throw notFound('NOT_FOUND', 'The folder does not exist.');
  if (!isLibrary(root)) throw notFound('NOT_A_LIBRARY', 'This folder is not a media-view library yet.');

  let meta: LibraryMeta;
  try {
    meta = JSON.parse(fs.readFileSync(metaFile(root), 'utf8')) as LibraryMeta;
  } catch {
    throw badRequest('INVALID_LIBRARY', 'library.json is unreadable.');
  }
  if (typeof meta.id !== 'string') throw badRequest('INVALID_LIBRARY', 'library.json has no library id.');
  if (meta.formatVersion > FORMAT_VERSION) {
    throw badRequest('LIBRARY_TOO_NEW', 'This library was created by a newer version of media-view.');
  }

  closeLibrary();

  const db = openDatabase(path.join(dataDir(root), 'library.db'));
  const applied = migrate(db);
  current = {
    root,
    meta,
    db,
    moduleRoot: (module) => path.join(root, MODULE_ROOTS[module]),
  };

  setLogDir(path.join(dataDir(root), 'logs'));
  fs.mkdirSync(current.moduleRoot('images'), { recursive: true });
  ensureInbox(current);
  rememberLibrary(root);
  log('info', 'library', 'library opened', { path: root, migrations: applied });
  hooks?.opened(current);
  return current;
}

export function closeLibrary(): void {
  if (!current) return;
  log('info', 'library', 'library closed', { path: current.root });
  hooks?.closing(current);
  current.db.close();
  current = null;
  setLogDir(path.join(appDataDir(), 'logs'));
}

/**
 * The Inbox always exists: recreated silently (folder + marker + row) whenever it's missing.
 * It never raises a `missing_folder` issue.
 */
export function ensureInbox(lib: OpenLibrary): void {
  const { db } = lib;
  let row = db.prepare("SELECT id, uuid, rel_path FROM folders WHERE module = 'images' AND kind = 'inbox'")
    .get() as { id: number; uuid: string; rel_path: string } | undefined;

  const isNew = !row;
  if (!row) {
    const now = Date.now();
    const uuid = randomUUID();
    const id = db.prepare(
      `INSERT INTO folders (uuid, module, parent_id, kind, name, rel_path, created_at, updated_at)
       VALUES (?, 'images', NULL, 'inbox', ?, ?, ?, ?)`,
    ).run(uuid, INBOX_NAME, INBOX_NAME, now, now).lastInsertRowid as number;
    row = { id, uuid, rel_path: INBOX_NAME };
  }

  const dir = toAbsolute(lib.moduleRoot('images'), row.rel_path);
  const existed = fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true });
  const marker = readMarker(dir);
  if (marker?.kind !== 'inbox' || marker.folder !== row.uuid || marker.library !== lib.meta.id) {
    writeMarker(dir, 'inbox', lib.meta.id, row.uuid);
  }
  db.prepare('UPDATE folders SET missing_since = NULL WHERE id = ? AND missing_since IS NOT NULL').run(row.id);
  if (!existed && !isNew) log('info', 'library', 'inbox recreated', { path: dir });
}

export function libraryInfo(lib: OpenLibrary, scan: ScanStatus): LibraryInfo {
  const count = (sql: string) => (lib.db.prepare(sql).pluck().get() as number) ?? 0;
  return {
    id: lib.meta.id,
    name: path.basename(lib.root),
    path: lib.root,
    createdAt: lib.meta.createdAt,
    stats: {
      folders: count("SELECT COUNT(*) FROM folders WHERE module = 'images' AND kind <> 'inbox' AND missing_since IS NULL"),
      categories: count("SELECT COUNT(*) FROM folders WHERE module = 'images' AND kind = 'category' AND missing_since IS NULL"),
      files: count("SELECT COUNT(*) FROM files WHERE media_type = 'image' AND recycled = 0 AND missing_since IS NULL"),
      inboxFiles: count(
        `SELECT COUNT(*) FROM files f JOIN folders d ON d.id = f.folder_id
         WHERE d.kind = 'inbox' AND f.recycled = 0 AND f.missing_since IS NULL`,
      ),
    },
    scan,
  };
}
