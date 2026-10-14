import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { OpenLibrary } from '../src/services/library.ts';

/** A fresh temp dir; also points the app-data dir at it so tests never touch %APPDATA%. */
export function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-view-test-'));
  process.env.MEDIA_VIEW_APPDATA = path.join(dir, 'appdata');
  return dir;
}

/** Helpers for building a library tree under `Images/`. Paths use '/'. */
export function tree(lib: OpenLibrary) {
  const abs = (rel: string) => path.join(lib.moduleRoot('images'), ...rel.split('/'));
  return {
    abs,
    /** Write a file; `content` makes its hash unique (defaults to its path). */
    file(rel: string, content: string = rel) {
      fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
      fs.writeFileSync(abs(rel), content);
    },
    dir(rel: string) {
      fs.mkdirSync(abs(rel), { recursive: true });
    },
    move(from: string, to: string) {
      fs.mkdirSync(path.dirname(abs(to)), { recursive: true });
      fs.renameSync(abs(from), abs(to));
    },
    remove(rel: string) {
      fs.rmSync(abs(rel), { recursive: true, force: true });
    },
    copyDir(from: string, to: string) {
      fs.cpSync(abs(from), abs(to), { recursive: true });
    },
  };
}

export function folderByPath(lib: OpenLibrary, relPath: string) {
  return lib.db.prepare('SELECT * FROM folders WHERE rel_path = ?').get(relPath) as
    | { id: number; uuid: string; kind: string; parent_id: number | null; rel_path: string; missing_since: number | null }
    | undefined;
}

export function fileByPath(lib: OpenLibrary, relPath: string) {
  return lib.db.prepare('SELECT * FROM files WHERE rel_path = ?').get(relPath) as
    | { id: number; folder_id: number; category_id: number; hash: string | null; missing_since: number | null; rel_path: string }
    | undefined;
}

export function issues(lib: OpenLibrary, kind?: string) {
  const rows = lib.db.prepare('SELECT kind, subject, payload FROM health_issues ORDER BY kind, subject').all() as
    { kind: string; subject: string; payload: string }[];
  return rows.filter((r) => !kind || r.kind === kind).map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }));
}

/** Star (or unstar) an image as the profile in use — each profile has its own stars (docs/profiles.md §3). */
export function star(lib: OpenLibrary, fileId: number, on = true): void {
  if (on) lib.db.prepare('INSERT OR IGNORE INTO profile_favorites (profile_id, file_id, added_at) VALUES (?, ?, 0)').run(lib.profileId, fileId);
  else lib.db.prepare('DELETE FROM profile_favorites WHERE profile_id = ? AND file_id = ?').run(lib.profileId, fileId);
}

/** Starred by anyone. */
export function starred(lib: OpenLibrary, fileId: number): boolean {
  return !!lib.db.prepare('SELECT 1 FROM profile_favorites WHERE file_id = ?').get(fileId);
}
