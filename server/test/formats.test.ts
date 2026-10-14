import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatCounts, listFiles } from '../src/services/files.ts';
import { healthReport } from '../src/services/health.ts';
import { closeLibrary, createLibrary, type OpenLibrary } from '../src/services/library.ts';
import { convertingStatus, getPreview, kickPreviews, previewPath, startPreviews, stopPreviews } from '../src/services/previews.ts';
import { reconcile } from '../src/services/reconcile.ts';
import { hashPending } from '../src/workers/hasher.ts';
import { fileByPath, tempDir, tree } from './helpers.ts';

let lib: OpenLibrary;
let t: ReturnType<typeof tree>;

async function tiff(rel: string, color: string, width = 60) {
  fs.mkdirSync(path.dirname(t.abs(rel)), { recursive: true });
  await sharp({ create: { width, height: 40, channels: 3, background: color } }).tiff().toFile(t.abs(rel));
}

beforeEach(() => {
  lib = createLibrary(path.join(tempDir(), 'Lib'));
  t = tree(lib);
  startPreviews(lib);
});

afterEach(() => {
  stopPreviews();
  closeLibrary();
});

describe('TIFF viewer copies', () => {
  it('are made ahead of time once the files are hashed, as WebP', async () => {
    await tiff('Scans/Old/a.tif', '#ff0000');
    await tiff('Scans/Old/b.tiff', '#00ff00');
    await reconcile(lib);
    await hashPending(lib);
    await kickPreviews(lib);
    expect(convertingStatus()).toBeNull();
    for (const rel of ['Scans/Old/a.tif', 'Scans/Old/b.tiff']) {
      const f = fileByPath(lib, rel)!;
      const copy = previewPath(lib, f);
      expect(fs.existsSync(copy)).toBe(true);
      expect(await sharp(copy).metadata()).toMatchObject({ format: 'webp', width: 60, height: 40 });
    }
  });

  it('the viewer gets one right away before hashing; it’s kept once the file is hashed', async () => {
    await tiff('Scans/Old/c.tif', '#0000ff');
    await reconcile(lib);
    const f = fileByPath(lib, 'Scans/Old/c.tif')!;
    expect(f.hash).toBeNull();
    const temp = await getPreview(lib, { ...f, ext: 'tif' });
    expect(fs.existsSync(temp)).toBe(true);
    await hashPending(lib);
    const hashed = fileByPath(lib, 'Scans/Old/c.tif')!;
    expect(fs.existsSync(previewPath(lib, hashed))).toBe(true);
    expect(fs.existsSync(temp)).toBe(false);
  });

  it('copies no image uses any more count as unused thumbnails', async () => {
    await tiff('Scans/Old/d.tif', '#ffff00');
    await reconcile(lib);
    await hashPending(lib);
    await kickPreviews(lib);
    const before = healthReport(lib).thumbnails.count;
    fs.mkdirSync(path.join(lib.root, '.mediaview', 'previews', 'ab'), { recursive: true });
    fs.writeFileSync(path.join(lib.root, '.mediaview', 'previews', 'ab', `ab${'0'.repeat(62)}.webp`), 'old');
    expect(healthReport(lib).thumbnails.count).toBe(before + 1);
  });
});

describe('sort by format', () => {
  it('groups by format — every JPEG spelling is one JPG — then by name', async () => {
    for (const n of ['b.png', 'c.jpeg', 'a.jpg', 'd.jfif', 'e.gif', 'f.jpe', 'a.png']) t.file(`Scans/Mixed/${n}`, n);
    await reconcile(lib);
    const folder = fileByPath(lib, 'Scans/Mixed/a.jpg')!.folder_id;
    const names = (order: 'asc' | 'desc') => listFiles(lib, { folder, sort: 'format', order }).items.map((i) => i.filename);
    expect(names('asc')).toEqual(['e.gif', 'a.jpg', 'c.jpeg', 'd.jfif', 'f.jpe', 'a.png', 'b.png']);
    expect(names('desc')).toEqual(['b.png', 'a.png', 'f.jpe', 'd.jfif', 'c.jpeg', 'a.jpg', 'e.gif']);
  });
});

describe('group by format', () => {
  it('orders by format first, then by the sort, and counts each format', async () => {
    for (const n of ['b.png', 'c.jpeg', 'a.jpg', 'z.gif', 'a.png']) t.file(`Scans/Mixed/${n}`, n);
    await reconcile(lib);
    const folder = fileByPath(lib, 'Scans/Mixed/a.jpg')!.folder_id;
    const names = listFiles(lib, { folder, sort: 'name', order: 'desc', byFormat: true }).items.map((i) => i.filename);
    expect(names).toEqual(['z.gif', 'c.jpeg', 'a.jpg', 'b.png', 'a.png']);
    expect(formatCounts(lib, { folder, sort: 'name', order: 'asc' }).formats).toEqual([
      { format: 'GIF', count: 1 }, { format: 'JPG', count: 2 }, { format: 'PNG', count: 2 },
    ]);
  });
});
