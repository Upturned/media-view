import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readMarker } from '../src/lib/markers.ts';
import { closeLibrary, createLibrary, type OpenLibrary } from '../src/services/library.ts';
import { reconcile } from '../src/services/reconcile.ts';
import { hashPending } from '../src/workers/hasher.ts';
import { fileByPath, folderByPath, issues, tempDir, tree } from './helpers.ts';

let lib: OpenLibrary;
let t: ReturnType<typeof tree>;

beforeEach(() => {
  lib = createLibrary(path.join(tempDir(), 'Lib'));
  t = tree(lib);
});

afterEach(() => closeLibrary());

/** Scan, then hash everything (as the background hasher would). */
async function scan() {
  const result = await reconcile(lib);
  await hashPending(lib);
  return result;
}

describe('reconciliation: importing an existing tree', () => {
  it('registers folders with inferred kinds, writes markers and inserts every image', async () => {
    t.file('Fantasy/Elves/Portraits/aerin.png');
    t.file('Fantasy/Elves/Portraits/lathir.jpg');
    t.file('Fantasy/Maps/world.webp');
    t.dir('Fantasy/Empty');
    t.dir('Photography');

    const result = await scan();

    expect(result).toMatchObject({ foldersAdded: 6, filesAdded: 3 });
    expect(folderByPath(lib, 'Fantasy')?.kind).toBe('category');
    expect(folderByPath(lib, 'Fantasy/Elves')?.kind).toBe('subcategory');
    expect(folderByPath(lib, 'Fantasy/Elves/Portraits')?.kind).toBe('album');
    expect(folderByPath(lib, 'Fantasy/Maps')?.kind).toBe('album');
    expect(folderByPath(lib, 'Photography')?.kind).toBe('category');

    const portraits = folderByPath(lib, 'Fantasy/Elves/Portraits')!;
    expect(readMarker(t.abs('Fantasy/Elves/Portraits'))).toMatchObject({ kind: 'album', folder: portraits.uuid });

    const aerin = fileByPath(lib, 'Fantasy/Elves/Portraits/aerin.png')!;
    expect(aerin.folder_id).toBe(portraits.id);
    expect(aerin.category_id).toBe(folderByPath(lib, 'Fantasy')!.id);
    expect(aerin.hash).toMatch(/^[0-9a-f]{64}$/);

    // Registered right away, but the kind still waits for confirmation; an empty folder is a guess.
    const unmarked = issues(lib, 'unmarked_folder');
    expect(unmarked).toHaveLength(4); // not the two top-level folders: always categories, nothing to confirm
    expect(unmarked.find((i) => i.payload.path === 'Fantasy/Empty')?.payload).toMatchObject({ inferred: 'album', certain: false });
  });

  it('a second scan of an unchanged library changes nothing', async () => {
    t.file('Fantasy/Maps/world.webp');
    await scan();
    const second = await scan();
    expect(second).toMatchObject({ foldersAdded: 0, foldersMoved: 0, filesAdded: 0, filesChanged: 0, filesMoved: 0, filesMissing: 0 });
  });
});

describe('reconciliation: changes made outside the app', () => {
  it('follows a folder renamed in Explorer, keeping ids, and records it for Keep / Undo', async () => {
    t.file('Fantasy/Elves/Portraits/aerin.png');
    await scan();
    const elves = folderByPath(lib, 'Fantasy/Elves')!;
    const aerin = fileByPath(lib, 'Fantasy/Elves/Portraits/aerin.png')!;

    t.move('Fantasy/Elves', 'Fantasy/High Elves');
    const result = await scan();

    expect(result.foldersMoved).toBe(1);
    expect(folderByPath(lib, 'Fantasy/High Elves')?.id).toBe(elves.id);
    expect(folderByPath(lib, 'Fantasy/High Elves/Portraits')).toBeDefined();
    expect(fileByPath(lib, 'Fantasy/High Elves/Portraits/aerin.png')?.id).toBe(aerin.id);
    expect(issues(lib, 'external_move')).toEqual([
      expect.objectContaining({ subject: `folder:${elves.id}`, payload: expect.objectContaining({ from: 'Fantasy/Elves', to: 'Fantasy/High Elves' }) }),
    ]);

    // Renamed back: nothing left to review.
    t.move('Fantasy/High Elves', 'Fantasy/Elves');
    await scan();
    expect(issues(lib, 'external_move')).toEqual([]);
  });

  it('follows a folder moved to another category, re-kinding it by position', async () => {
    t.file('Fantasy/Elves/Portraits/aerin.png');
    t.dir('Archive');
    await scan();
    const elves = folderByPath(lib, 'Fantasy/Elves')!;

    t.move('Fantasy/Elves', 'Elves'); // a drawer moved to the top level becomes a rack
    await scan();

    expect(folderByPath(lib, 'Elves')).toMatchObject({ id: elves.id, kind: 'category', parent_id: null });
    expect(fileByPath(lib, 'Elves/Portraits/aerin.png')?.category_id).toBe(elves.id);
  });

  it('recognizes a moved image by its content, grouping moves per folder pair', async () => {
    t.file('Fantasy/A/one.png');
    t.file('Fantasy/A/two.png');
    t.dir('Fantasy/B');
    await scan();
    const one = fileByPath(lib, 'Fantasy/A/one.png')!;

    t.move('Fantasy/A/one.png', 'Fantasy/B/one.png');
    t.move('Fantasy/A/two.png', 'Fantasy/B/renamed.png');
    const result = await scan();

    expect(result.filesMoved).toBe(2);
    expect(fileByPath(lib, 'Fantasy/B/one.png')?.id).toBe(one.id);
    const moves = issues(lib, 'external_move');
    expect(moves).toHaveLength(1);
    expect(moves[0]!.payload.files).toHaveLength(2);
  });

  it('never guesses between identical copies: ambiguous moves become an issue', async () => {
    t.file('Fantasy/A/x.png', 'same bytes');
    t.file('Fantasy/B/x.png', 'same bytes');
    t.dir('Fantasy/C');
    await scan();
    expect(issues(lib, 'duplicate')).toHaveLength(1);
    const a = fileByPath(lib, 'Fantasy/A/x.png')!;
    const b = fileByPath(lib, 'Fantasy/B/x.png')!;

    t.remove('Fantasy/A/x.png');
    t.move('Fantasy/B/x.png', 'Fantasy/C/x.png');
    await scan();

    const reappeared = fileByPath(lib, 'Fantasy/C/x.png')!;
    expect([a.id, b.id]).not.toContain(reappeared.id);
    expect(fileByPath(lib, 'Fantasy/A/x.png')?.missing_since).not.toBeNull();
    expect(fileByPath(lib, 'Fantasy/B/x.png')?.missing_since).not.toBeNull();
    expect(issues(lib, 'ambiguous_move')[0]?.payload).toMatchObject({ fileId: reappeared.id, candidates: expect.arrayContaining([{ id: a.id, path: 'Fantasy/A/x.png' }]) });
  });

  it('a copied image is a new file and a duplicate, not a move', async () => {
    t.file('Fantasy/A/x.png', 'bytes');
    await scan();
    t.file('Fantasy/A/copy.png', 'bytes');
    const result = await scan();
    expect(result).toMatchObject({ filesAdded: 1, filesMoved: 0 });
    expect(issues(lib, 'duplicate')[0]?.payload.fileIds).toHaveLength(2);
  });

  it('a folder copied in Explorer gets its own identity', async () => {
    t.file('Fantasy/Portraits/a.png');
    await scan();
    const original = folderByPath(lib, 'Fantasy/Portraits')!;

    t.copyDir('Fantasy/Portraits', 'Fantasy/Portraits copy');
    await scan();

    const copy = folderByPath(lib, 'Fantasy/Portraits copy')!;
    expect(copy.id).not.toBe(original.id);
    expect(folderByPath(lib, 'Fantasy/Portraits')?.id).toBe(original.id);
    expect(readMarker(t.abs('Fantasy/Portraits copy'))?.folder).toBe(copy.uuid);
  });

  it('keeps everything when files and folders go missing, and recovers when they come back', async () => {
    t.file('Fantasy/Portraits/a.png');
    await scan();
    const album = folderByPath(lib, 'Fantasy/Portraits')!;
    const file = fileByPath(lib, 'Fantasy/Portraits/a.png')!;
    lib.db.prepare('UPDATE files SET favorited = 1 WHERE id = ?').run(file.id);

    fs.renameSync(t.abs('Fantasy/Portraits'), path.join(lib.root, 'away'));
    const gone = await scan();
    expect(gone).toMatchObject({ foldersMissing: 1, filesMissing: 1 });
    expect(folderByPath(lib, 'Fantasy/Portraits')?.missing_since).not.toBeNull();
    expect(issues(lib).map((i) => i.kind)).toEqual(expect.arrayContaining(['missing_file', 'missing_folder']));

    fs.renameSync(path.join(lib.root, 'away'), t.abs('Fantasy/Portraits'));
    await scan();
    expect(folderByPath(lib, 'Fantasy/Portraits')).toMatchObject({ id: album.id, missing_since: null });
    expect(lib.db.prepare('SELECT favorited, missing_since FROM files WHERE id = ?').get(file.id)).toEqual({ favorited: 1, missing_since: null });
    expect(issues(lib, 'missing_file')).toEqual([]);
    expect(issues(lib, 'missing_folder')).toEqual([]);
  });

  it('refreshes metadata when content changes, keeping the row', async () => {
    t.file('Fantasy/A/x.png', 'v1');
    await scan();
    const before = fileByPath(lib, 'Fantasy/A/x.png')!;
    t.file('Fantasy/A/x.png', 'version two');
    const result = await scan();
    const after = fileByPath(lib, 'Fantasy/A/x.png')!;
    expect(result.filesChanged).toBe(1);
    expect(after.id).toBe(before.id);
    expect(after.hash).not.toBe(before.hash);
  });
});

describe('reconciliation: rules', () => {
  it('reports loose images, folders inside albums and wrong file types', async () => {
    t.file('Fantasy/Portraits/a.png');
    await scan(); // Portraits is an album now

    t.file('loose-at-root.png');
    t.file('Fantasy/loose.png');
    t.file('Fantasy/Portraits/Nested/deep.png');
    t.file('Fantasy/Portraits/notes.txt');
    t.file('Fantasy/Portraits/archive.zip');
    t.file('Fantasy/Portraits/desktop.ini');
    await scan();

    const portraits = folderByPath(lib, 'Fantasy/Portraits')!;
    expect(folderByPath(lib, 'Fantasy/Portraits/Nested')).toBeUndefined();
    expect(fileByPath(lib, 'Fantasy/Portraits/Nested/deep.png')?.folder_id).toBe(portraits.id);
    expect(fileByPath(lib, 'loose-at-root.png')).toBeUndefined();

    const kinds = issues(lib).filter((i) => i.kind !== 'unmarked_folder').map((i) => `${i.kind} ${i.subject}`);
    expect(kinds).toEqual([
      `loose_files folder:${folderByPath(lib, 'Fantasy')!.id}`,
      'loose_files root',
      'moved_file path:Fantasy/Portraits/notes.txt', // a text file: moved to Texts by itself, with a notice
      'nested_in_album path:Fantasy/Portraits/Nested',
      'wrong_type path:Fantasy/Portraits/archive.zip',
    ]);
    expect(fs.existsSync(path.join(lib.moduleRoot('texts'), 'Fantasy', 'Portraits', 'notes.txt'))).toBe(true);

    // Fixed on disk: the issues go away on the next scan.
    t.remove('Fantasy/loose.png');
    t.remove('Fantasy/Portraits/archive.zip');
    await scan();
    expect(issues(lib, 'wrong_type')).toEqual([]);
    expect(issues(lib, 'loose_files').map((i) => i.subject)).toEqual(['root']);
  });

  it('recreates a deleted Inbox and treats paths with _ and % literally', async () => {
    t.remove('Inbox');
    t.file('my_album/a.png');
    t.file('myXalbum/b.png');
    t.file('100%/c.png');
    await scan();
    expect(readMarker(t.abs('Inbox'))?.kind).toBe('inbox');
    expect(folderByPath(lib, 'my_album')).toBeDefined();
    expect(folderByPath(lib, 'myXalbum')).toBeDefined();

    // Renaming my_album must not touch myXalbum (a LIKE 'my_album/%' would match it).
    t.move('my_album', 'renamed');
    await scan();
    expect(fileByPath(lib, 'myXalbum/b.png')).toBeDefined();
    expect(fileByPath(lib, 'renamed/a.png')).toBeDefined();
  });
});
