import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { closeLibrary, createLibrary, type OpenLibrary } from '../src/services/library.ts';
import { reconcile } from '../src/services/reconcile.ts';
import { startThumbnails, stopThumbnails, thumbPath } from '../src/services/thumbnails.ts';
import { hashPending } from '../src/workers/hasher.ts';
import { fileByPath, folderByPath, tempDir, tree } from './helpers.ts';

let lib: OpenLibrary;
let t: ReturnType<typeof tree>;
const app = createApp(new Set(['http://localhost:4321']));

function get(url: string) {
  return app.request(url, { headers: { Host: 'localhost:4321' } });
}
async function getJson<T = any>(url: string): Promise<T> {
  const res = await get(url);
  expect(res.status, `${url} → ${res.status}`).toBe(200);
  return res.json() as Promise<T>;
}
function send(method: string, url: string, body: unknown) {
  return app.request(url, {
    method,
    headers: { Host: 'localhost:4321', Origin: 'http://localhost:4321', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function png(rel: string, width: number, height: number, color: string) {
  const abs = t.abs(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: color } }).png().toFile(abs);
}

beforeEach(async () => {
  lib = createLibrary(path.join(tempDir(), 'Lib'));
  t = tree(lib);
  startThumbnails(lib);
  t.file('Fantasy/Elves/Portraits/b.png', 'bb');
  t.file('Fantasy/Elves/Portraits/a.png', 'a');
  t.file('Fantasy/Elves/Portraits/c 50%_off.png', 'ccc');
  t.file('Fantasy/Maps/world.png', 'w');
  t.file('Inbox/new.png', 'n');
  t.dir('Photography');
  await reconcile(lib);
  await hashPending(lib);
});

afterEach(() => {
  stopThumbnails();
  closeLibrary();
});

describe('folders API', () => {
  it('lists the Library page: Inbox apart, categories a→z with rolled-up counts', async () => {
    const { front } = await getJson('/api/folders');
    expect(front.inbox).toMatchObject({ kind: 'inbox', imageCount: 1, newThisWeek: 1 });
    expect(front.categories.map((c: any) => [c.name, c.imageCount, c.subcategoryCount, c.albumCount])).toEqual([
      ['Fantasy', 4, 1, 1],
      ['Photography', 0, 0, 0],
    ]);
    expect(front.categories[0].covers).toHaveLength(3);
  });

  it('gives children and details with breadcrumbs', async () => {
    const elves = folderByPath(lib, 'Fantasy/Elves')!;
    const { children } = await getJson(`/api/folders?parent=${elves.id}`);
    expect(children.map((c: any) => c.name)).toEqual(['Portraits']);

    const portraits = folderByPath(lib, 'Fantasy/Elves/Portraits')!;
    const detail = await getJson(`/api/folders/${portraits.id}`);
    expect(detail.ancestors.map((a: any) => a.name)).toEqual(['Fantasy', 'Elves']);
  });

  it('creates folders on disk with a marker, enforcing the structure rules', async () => {
    const fantasy = folderByPath(lib, 'Fantasy')!;
    const res = await send('POST', '/api/folders', { parentId: fantasy.id, kind: 'album', name: 'Battle Scenes' });
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(t.abs('Fantasy/Battle Scenes'), '.album'))).toBe(true);

    const album = folderByPath(lib, 'Fantasy/Battle Scenes')!;
    const nested = await send('POST', '/api/folders', { parentId: album.id, kind: 'album', name: 'x' });
    expect(nested.status).toBe(400);
    const clash = await send('POST', '/api/folders', { parentId: fantasy.id, kind: 'album', name: 'battle scenes' });
    expect(clash.status).toBe(409);
    const bad = await send('POST', '/api/folders', { parentId: null, kind: 'category', name: 'a:b' });
    expect((await bad.json()).error.code).toBe('INVALID_NAME');
  });
});

describe('files API', () => {
  const portraitsQuery = () => `folder=${folderByPath(lib, 'Fantasy/Elves/Portraits')!.id}`;

  it('lists an album sorted and paged, and filters by name literally', async () => {
    const all = await getJson(`/api/files?${portraitsQuery()}&sort=name`);
    expect(all.total).toBe(3);
    expect(all.items.map((f: any) => f.filename)).toEqual(['a.png', 'b.png', 'c 50%_off.png']);

    const page = await getJson(`/api/files?${portraitsQuery()}&sort=size&order=desc&offset=1&limit=1`);
    expect(page.items.map((f: any) => f.filename)).toEqual(['b.png']);

    const named = await getJson(`/api/files?${portraitsQuery()}&name=${encodeURIComponent('50%_')}`);
    expect(named.items.map((f: any) => f.filename)).toEqual(['c 50%_off.png']);
  });

  it('lists everything under a folder recursively', async () => {
    const fantasy = folderByPath(lib, 'Fantasy')!;
    expect((await getJson(`/api/files?folder=${fantasy.id}`)).total).toBe(0); // no loose images in a rack
    expect((await getJson(`/api/files?folder=${fantasy.id}&recursive=1`)).total).toBe(4);
  });

  it('locates a file for the viewer and keeps random order stable across pages', async () => {
    const b = fileByPath(lib, 'Fantasy/Elves/Portraits/b.png')!;
    expect((await getJson(`/api/files/locate?${portraitsQuery()}&sort=name&id=${b.id}`)).position).toEqual({ index: 1, total: 3 });

    const q = `${portraitsQuery()}&sort=random&seed=12345`;
    const full = (await getJson(`/api/files?${q}`)).items.map((f: any) => f.id);
    const paged = [
      ...(await getJson(`/api/files?${q}&limit=2`)).items,
      ...(await getJson(`/api/files?${q}&offset=2&limit=2`)).items,
    ].map((f: any) => f.id);
    expect(paged).toEqual(full);

    const { id } = await getJson(`/api/files/random?${portraitsQuery()}&exclude=${b.id}`);
    expect(id).not.toBe(b.id);
  });

  it('toggles favorites and filters by them', async () => {
    const a = fileByPath(lib, 'Fantasy/Elves/Portraits/a.png')!;
    const res = await send('PATCH', `/api/files/${a.id}`, { favorited: true });
    expect((await res.json()).favorited).toBe(true);
    const favs = await getJson(`/api/files?${portraitsQuery()}&favorites=1`);
    expect(favs.items.map((f: any) => f.id)).toEqual([a.id]);
  });
});

describe('media', () => {
  it('serves originals with ranges and makes content-addressed thumbnails', async () => {
    await png('Fantasy/Maps/big.png', 1200, 600, '#ff4b2b');
    await reconcile(lib);
    const big = fileByPath(lib, 'Fantasy/Maps/big.png')!;

    // Before hashing: a temporary thumbnail keyed by id.
    const thumb = await get(`/media/thumb/${big.id}`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([400, 200]);
    expect(lib.db.prepare('SELECT width, height FROM files WHERE id = ?').get(big.id)).toEqual({ width: 1200, height: 600 });

    // After hashing it's renamed to its hash.
    await hashPending(lib);
    const hashed = fileByPath(lib, 'Fantasy/Maps/big.png')!;
    expect(fs.existsSync(thumbPath(lib, hashed))).toBe(true);
    expect(fs.existsSync(thumbPath(lib, { id: big.id, hash: null }))).toBe(false);

    const range = await app.request(`/media/file/${big.id}`, { headers: { Host: 'localhost:4321', Range: 'bytes=0-7' } });
    expect(range.status).toBe(206);
    expect(Buffer.from(await range.arrayBuffer())).toEqual(fs.readFileSync(t.abs('Fantasy/Maps/big.png')).subarray(0, 8));
  });

  it('reports a file with an image extension that is not an image', async () => {
    const world = fileByPath(lib, 'Fantasy/Maps/world.png')!; // contains the text "w"
    const res = await get(`/media/thumb/${world.id}`);
    expect(res.status).toBe(404);
    const issue = lib.db.prepare("SELECT subject FROM health_issues WHERE kind = 'wrong_type'").pluck().all();
    expect(issue).toEqual([`file:${world.id}`]);

    // A rescan doesn't drop it: the scan can't tell, only the thumbnailer can.
    await reconcile(lib);
    expect(lib.db.prepare("SELECT COUNT(*) FROM health_issues WHERE kind = 'wrong_type'").pluck().get()).toBe(1);
  });
});
