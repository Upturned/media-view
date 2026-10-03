import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readMarker } from '../src/lib/markers.ts';
import { bulkRename, copyFiles, moveFiles, renameFile, setFileDescription, undoMove } from '../src/services/file-ops.ts';
import { createFolder, moveFolder, renameFolder, setFolderCover } from '../src/services/folders.ts';
import { importPath, importStream } from '../src/services/import.ts';
import { closeLibrary, createLibrary, type OpenLibrary } from '../src/services/library.ts';
import { reconcile } from '../src/services/reconcile.ts';
import { deletePermanently, emptyBin, listBin, recycleFiles, recycleFolder, restore } from '../src/services/recycle.ts';
import { hashPending } from '../src/workers/hasher.ts';
import { fileByPath, folderByPath, issues, tempDir, tree } from './helpers.ts';

let lib: OpenLibrary;
let t: ReturnType<typeof tree>;
let dir: string;

beforeEach(async () => {
  dir = tempDir();
  lib = createLibrary(path.join(dir, 'Lib'));
  t = tree(lib);
  t.file('Fantasy/Portraits/a.png', 'a');
  t.file('Fantasy/Portraits/b.png', 'b');
  t.file('Fantasy/Portraits/c.png', 'c');
  t.file('Fantasy/Maps/a.png', 'other a');
  t.file('Fantasy/Elves/Court/x.png', 'x');
  t.dir('Photography');
  await reconcile(lib);
  await hashPending(lib);
});

afterEach(() => closeLibrary());

const id = (rel: string) => fileByPath(lib, rel)!.id;
const fid = (rel: string) => folderByPath(lib, rel)!.id;
const exists = (rel: string) => fs.existsSync(t.abs(rel));

/** After the app's own operations, a scan must find nothing to change or report. */
async function expectQuietScan() {
  const before = issues(lib).filter((i) => i.kind !== 'unmarked_folder' && i.kind !== 'duplicate').length;
  const r = await reconcile(lib);
  expect(r).toMatchObject({ foldersAdded: 0, foldersMoved: 0, foldersMissing: 0, filesAdded: 0, filesMoved: 0, filesMissing: 0 });
  expect(issues(lib).filter((i) => i.kind !== 'unmarked_folder' && i.kind !== 'duplicate')).toHaveLength(before);
}

describe('moving and copying images', () => {
  it('moves images, keeping their ids, and undoes the move', async () => {
    const a = id('Fantasy/Portraits/a.png');
    lib.db.prepare('UPDATE files SET favorited = 1 WHERE id = ?').run(a);
    const r = moveFiles(lib, [a, id('Fantasy/Portraits/b.png')], fid('Fantasy/Maps'));

    // a.png clashes with Maps/a.png: keep both.
    expect(r).toMatchObject({ done: 2, renamed: [{ id: a, from: 'a.png', to: 'a (1).png' }] });
    expect(fileByPath(lib, 'Fantasy/Maps/a (1).png')).toMatchObject({ id: a, folder_id: fid('Fantasy/Maps') });
    expect(exists('Fantasy/Portraits/a.png')).toBe(false);
    await expectQuietScan();

    undoMove(lib, r.undo);
    expect(fileByPath(lib, 'Fantasy/Portraits/a.png')?.id).toBe(a);
    expect(exists('Fantasy/Maps/a (1).png')).toBe(false);
    expect(lib.db.prepare('SELECT favorited FROM files WHERE id = ?').pluck().get(a)).toBe(1);
  });

  it('skips or replaces on a clash; replacing recycles the old image, never a starred one', () => {
    const skipped = moveFiles(lib, [id('Fantasy/Portraits/a.png')], fid('Fantasy/Maps'), 'skip');
    expect(skipped.done).toBe(0);
    expect(skipped.skipped).toHaveLength(1);

    const old = id('Fantasy/Maps/a.png');
    const replaced = moveFiles(lib, [id('Fantasy/Portraits/a.png')], fid('Fantasy/Maps'), 'replace');
    expect(replaced).toMatchObject({ done: 1, replaced: 1 });
    expect(listBin(lib).map((b) => b.name)).toEqual(['a.png']);
    expect(lib.db.prepare('SELECT recycled FROM files WHERE id = ?').pluck().get(old)).toBe(1);

    const now = id('Fantasy/Maps/a.png');
    lib.db.prepare('UPDATE files SET favorited = 1 WHERE id = ?').run(now);
    t.file('Fantasy/Portraits/a.png', 'new a');
    return reconcile(lib).then(() => {
      const r = moveFiles(lib, [id('Fantasy/Portraits/a.png')], fid('Fantasy/Maps'), 'replace');
      expect(r).toMatchObject({ done: 1, replaced: 0, renamed: [{ to: 'a (1).png' }] });
    });
  });

  it('copies images as new files with their own ids', async () => {
    const a = id('Fantasy/Portraits/a.png');
    setFileDescription(lib, a, 'portrait');
    const r = await copyFiles(lib, [a], fid('Fantasy/Maps'));
    const copy = fileByPath(lib, 'Fantasy/Maps/a (1).png')!;
    expect(r.ids).toEqual([copy.id]);
    expect(copy.id).not.toBe(a);
    expect(copy.hash).toBe(fileByPath(lib, 'Fantasy/Portraits/a.png')!.hash);
    expect(exists('Fantasy/Portraits/a.png')).toBe(true);
    await expectQuietScan();
  });

  it('only accepts albums and the Inbox as targets', () => {
    expect(() => moveFiles(lib, [id('Fantasy/Portraits/a.png')], fid('Fantasy'))).toThrow(/album or the Inbox/);
    const r = moveFiles(lib, [id('Fantasy/Portraits/a.png')], null);
    expect(r.done).toBe(1);
    expect(fileByPath(lib, 'Inbox/a.png')).toBeDefined();
  });
});

describe('renaming images', () => {
  it('renames one image, keeping the extension; clashes are errors; case-only works', async () => {
    const a = id('Fantasy/Portraits/a.png');
    expect(renameFile(lib, a, 'aerin').filename).toBe('aerin.png');
    expect(() => renameFile(lib, a, 'b')).toThrow(/already exists/);
    expect(() => renameFile(lib, a, 'bad/name')).toThrow(/Not allowed/);
    expect(renameFile(lib, a, 'AERIN').filename).toBe('AERIN.png');
    expect(exists('Fantasy/Portraits/AERIN.png')).toBe(true);
    await expectQuietScan();
  });

  it('bulk renames in the given order, including swaps, and refuses conflicts', async () => {
    const [a, b, c] = ['a', 'b', 'c'].map((n) => id(`Fantasy/Portraits/${n}.png`));
    expect(bulkRename(lib, [c!, b!, a!], 'ref_#', 1, 2)).toEqual({ renamed: 3 });
    expect(fileByPath(lib, 'Fantasy/Portraits/ref_01.png')?.id).toBe(c);
    expect(fileByPath(lib, 'Fantasy/Portraits/ref_03.png')?.id).toBe(a);

    // Swap: 01 ↔ 02 by renumbering in reverse.
    bulkRename(lib, [b!, c!], 'ref_#', 1, 2);
    expect(fileByPath(lib, 'Fantasy/Portraits/ref_01.png')?.id).toBe(b);
    expect(fileByPath(lib, 'Fantasy/Portraits/ref_02.png')?.id).toBe(c);

    expect(() => bulkRename(lib, [a!, b!], 'same', 1, 1)).toThrow(/unique/);
    expect(() => bulkRename(lib, [a!], 'ref_01', 1, 1)).toThrow(/already exists/);
    expect(fileByPath(lib, 'Fantasy/Portraits/ref_03.png')?.id).toBe(a); // untouched
    await expectQuietScan();
  });
});

describe('folders', () => {
  it('renames a folder; everything under it follows', async () => {
    const court = fid('Fantasy/Elves/Court');
    const x = id('Fantasy/Elves/Court/x.png');
    renameFolder(lib, fid('Fantasy/Elves'), 'High Elves');
    expect(folderByPath(lib, 'Fantasy/High Elves/Court')?.id).toBe(court);
    expect(fileByPath(lib, 'Fantasy/High Elves/Court/x.png')?.id).toBe(x);
    await expectQuietScan();
  });

  it('moves a folder; its kind and its images’ category follow the new place', async () => {
    const elves = fid('Fantasy/Elves');
    moveFolder(lib, elves, null);
    expect(folderByPath(lib, 'Elves')).toMatchObject({ id: elves, kind: 'category', parent_id: null });
    expect(readMarker(t.abs('Elves'))?.kind).toBe('category');
    expect(fileByPath(lib, 'Elves/Court/x.png')?.category_id).toBe(elves);

    moveFolder(lib, elves, fid('Photography'));
    expect(folderByPath(lib, 'Photography/Elves')).toMatchObject({ kind: 'subcategory' });
    expect(fileByPath(lib, 'Photography/Elves/Court/x.png')?.category_id).toBe(fid('Photography'));
    await expectQuietScan();

    expect(() => moveFolder(lib, fid('Fantasy/Maps'), null)).toThrow(/top level/);
    expect(() => moveFolder(lib, elves, fid('Photography/Elves/Court'))).toThrow(/Albums hold only images|itself/);
    expect(() => moveFolder(lib, fid('Photography'), fid('Photography/Elves'))).toThrow(/itself/);
  });

  it('sets a cover only from images inside the folder', () => {
    const fantasy = fid('Fantasy');
    expect(setFolderCover(lib, fantasy, id('Fantasy/Maps/a.png')).covers[0]?.id).toBe(id('Fantasy/Maps/a.png'));
    expect(() => setFolderCover(lib, fid('Fantasy/Maps'), id('Fantasy/Portraits/a.png'))).toThrow(/inside the folder/);
  });
});

describe('the Recycle Bin', () => {
  it('recycles images (never starred ones) and restores them losslessly', async () => {
    const [a, b] = [id('Fantasy/Portraits/a.png'), id('Fantasy/Portraits/b.png')];
    lib.db.prepare('UPDATE files SET favorited = 1 WHERE id = ?').run(b);
    setFileDescription(lib, a, 'keep me');

    expect(recycleFiles(lib, [a, b])).toEqual({ recycled: 1, starred: [b] });
    expect(exists('Fantasy/Portraits/a.png')).toBe(false);
    const [item] = listBin(lib);
    expect(item).toMatchObject({ entity: 'file', name: 'a.png', location: 'Fantasy\\Portraits', locationGone: false });
    await expectQuietScan();

    // Something new took its name meanwhile: keep both.
    t.file('Fantasy/Portraits/a.png', 'newcomer');
    await reconcile(lib);
    restore(lib, item!.id);
    expect(fileByPath(lib, 'Fantasy/Portraits/a (1).png')).toMatchObject({ id: a });
    expect(lib.db.prepare('SELECT description FROM files WHERE id = ?').pluck().get(a)).toBe('keep me');
    expect(listBin(lib)).toEqual([]);
    await expectQuietScan();
  });

  it('needs "Restore to…" when the original album is gone', () => {
    const a = id('Fantasy/Portraits/a.png');
    recycleFiles(lib, [a]);
    recycleFolder(lib, fid('Fantasy/Portraits'));
    const item = listBin(lib).find((i) => i.entity === 'file')!;
    expect(item.locationGone).toBe(true);
    expect(() => restore(lib, item.id)).toThrow(/Restore to/);
    restore(lib, item.id, fid('Fantasy/Maps'));
    expect(fileByPath(lib, 'Fantasy/Maps/a (1).png')?.id).toBe(a);
  });

  it('recycles a folder with everything in it, frees its name, and restores it', async () => {
    const portraits = fid('Fantasy/Portraits');
    const a = id('Fantasy/Portraits/a.png');
    lib.db.prepare('UPDATE files SET favorited = 1 WHERE id = ?').run(a);
    expect(() => recycleFolder(lib, portraits)).toThrow(/1 starred image/);
    lib.db.prepare('UPDATE files SET favorited = 0 WHERE id = ?').run(a);

    recycleFolder(lib, portraits);
    expect(exists('Fantasy/Portraits')).toBe(false);
    expect(listBin(lib)[0]).toMatchObject({ entity: 'folder', kind: 'album', inner: '3 images', images: 3 });
    await expectQuietScan();

    // The name is free again.
    createFolder(lib, { parentId: fid('Fantasy'), kind: 'album', name: 'Portraits' });
    restore(lib, listBin(lib)[0]!.id);
    expect(folderByPath(lib, 'Fantasy/Portraits (1)')?.id).toBe(portraits);
    expect(fileByPath(lib, 'Fantasy/Portraits (1)/a.png')).toMatchObject({ id: a, folder_id: portraits });
    await expectQuietScan();
  });

  it('deletes permanently, and empties the bin', () => {
    const a = id('Fantasy/Portraits/a.png');
    recycleFiles(lib, [a]);
    recycleFolder(lib, fid('Fantasy/Elves'));
    const [first] = listBin(lib);
    deletePermanently(lib, [first!.id]);
    expect(listBin(lib)).toHaveLength(1);
    emptyBin(lib);
    expect(listBin(lib)).toEqual([]);
    expect(lib.db.prepare('SELECT COUNT(*) FROM files WHERE id = ?').pluck().get(a)).toBe(0);
    expect(folderByPath(lib, 'Fantasy/Elves/Court')).toBeUndefined();
    expect(fs.readdirSync(path.join(lib.root, '.mediaview', 'recycle-bin'))).toEqual([]);
  });
});

describe('importing', () => {
  async function png(file: string, color: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp({ create: { width: 30, height: 20, channels: 3, background: color } }).png().toFile(file);
  }

  it('copies images in, renames on clashes, skips identical ones and rejects the rest', async () => {
    const outside = path.join(dir, 'Downloads');
    await png(path.join(outside, 'a.png'), '#ff0000');
    await png(path.join(outside, 'red copy.png'), '#ff0000');
    await png(path.join(outside, 'blue.png'), '#0000ff');
    fs.writeFileSync(path.join(outside, 'clip.mp4'), 'video');
    fs.writeFileSync(path.join(outside, 'layers.psd'), 'psd');
    fs.writeFileSync(path.join(outside, 'broken.png'), 'not really');
    const maps = fid('Fantasy/Maps');

    expect(await importPath(lib, maps, path.join(outside, 'a.png'))).toMatchObject({ status: 'renamed', savedAs: 'a (1).png' });
    expect(await importPath(lib, maps, path.join(outside, 'red copy.png'))).toMatchObject({ status: 'skipped' });
    expect(await importPath(lib, maps, path.join(outside, 'blue.png'))).toMatchObject({ status: 'copied' });
    expect((await importPath(lib, maps, path.join(outside, 'clip.mp4'))).reason).toMatch(/Video/);
    expect((await importPath(lib, maps, path.join(outside, 'layers.psd'))).reason).toMatch(/Unsupported format \(PSD\)/);
    expect((await importPath(lib, maps, path.join(outside, 'broken.png'))).reason).toMatch(/Couldn’t read/);

    expect(fileByPath(lib, 'Fantasy/Maps/blue.png')).toMatchObject({ hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(lib.db.prepare('SELECT width, height FROM files WHERE rel_path = ?').get('Fantasy/Maps/blue.png')).toEqual({ width: 30, height: 20 });
    expect(fs.existsSync(path.join(outside, 'blue.png'))).toBe(true); // originals untouched
    expect(fs.readdirSync(path.join(lib.root, '.mediaview', 'tmp'))).toEqual([]);
    await expectQuietScan();
  });

  it('imports a dropped file from a stream, into the Inbox by default', async () => {
    const buf = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#00ff00' } }).png().toBuffer();
    const r = await importStream(lib, null, 'dropped:name?.png', Readable.from([buf]));
    expect(r).toMatchObject({ status: 'copied', name: 'dropped_name_.png' });
    expect(fileByPath(lib, 'Inbox/dropped_name_.png')).toBeDefined();
  });
});
