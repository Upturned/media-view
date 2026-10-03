import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { readMarker } from '../src/lib/markers.ts';
import {
  closeLibrary, createLibrary, getLibrary, libraryInfo, openLibrary,
} from '../src/services/library.ts';
import { tempDir } from './helpers.ts';

let root: string;

beforeEach(() => {
  root = path.join(tempDir(), 'My Library');
});

afterEach(() => closeLibrary());

describe('library', () => {
  it('creates the layout, DB, default tag types and the Inbox', () => {
    const lib = createLibrary(root);

    for (const p of ['.mediaview/library.json', '.mediaview/library.db', '.mediaview/thumbnails',
      '.mediaview/recycle-bin', '.mediaview/logs', 'Images/Inbox/.inbox']) {
      expect(fs.existsSync(path.join(root, p)), p).toBe(true);
    }

    const types = lib.db.prepare('SELECT key, is_default FROM tag_types ORDER BY position').all();
    expect(types).toEqual([
      { key: 'general', is_default: 1 },
      { key: 'character', is_default: 0 },
      { key: 'source', is_default: 0 },
      { key: 'artist', is_default: 0 },
    ]);

    const inbox = lib.db.prepare("SELECT uuid, rel_path FROM folders WHERE kind = 'inbox'").get() as { uuid: string; rel_path: string };
    expect(inbox.rel_path).toBe('Inbox');
    expect(readMarker(path.join(root, 'Images', 'Inbox'))).toEqual({ kind: 'inbox', library: lib.meta.id, folder: inbox.uuid });

    expect(libraryInfo(lib)).toMatchObject({ name: 'My Library', stats: { folders: 0, files: 0, inboxFiles: 0 } });
    expect(loadConfig()).toMatchObject({ lastLibrary: root, recentLibraries: [root] });
  });

  it('refuses to create a library twice and to open a non-library', () => {
    createLibrary(root);
    expect(() => createLibrary(root)).toThrow(/already a library/);
    fs.mkdirSync(path.join(root, '..', 'plain'));
    expect(() => openLibrary(path.join(root, '..', 'plain'))).toThrow(expect.objectContaining({ code: 'NOT_A_LIBRARY' }));
  });

  it('recreates a missing Inbox silently on open, keeping its identity', () => {
    const lib = createLibrary(root);
    const uuid = lib.db.prepare("SELECT uuid FROM folders WHERE kind = 'inbox'").pluck().get();
    closeLibrary();

    fs.rmSync(path.join(root, 'Images', 'Inbox'), { recursive: true, force: true });
    const reopened = openLibrary(root);

    expect(readMarker(path.join(root, 'Images', 'Inbox'))?.folder).toBe(uuid);
    expect(reopened.db.prepare('SELECT COUNT(*) FROM health_issues').pluck().get()).toBe(0);
  });

  it('switching library closes the previous one', () => {
    createLibrary(root);
    const other = createLibrary(path.join(root, '..', 'Other'));
    expect(getLibrary()).toBe(other);
    expect(loadConfig().recentLibraries).toEqual([other.root, root]);
  });
});
