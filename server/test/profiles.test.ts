import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { MIGRATIONS_DIR } from '../src/lib/app-dir.ts';
import { flush, getLogDir } from '../src/lib/log.ts';
import { collectionDetail, createCollection, deleteCollection, restoreCollection } from '../src/services/collections.ts';
import { listFiles, setFavorite } from '../src/services/files.ts';
import { fixIssue, healthReport } from '../src/services/health.ts';
import { refreshDuplicates } from '../src/services/issues.ts';
import { closeLibrary, createLibrary, openLibrary, type OpenLibrary } from '../src/services/library.ts';
import {
  activeProfile, checkPassword, createProfile, deleteProfile, hashPassword, importPrefs, linkTag, listProfiles, lockProfile,
  profileInfo, profileTags, setPassword, switchProfile, unlinkTag, updatePrefs, updateProfile, WRONG_PASSWORD_DELAY_MS,
} from '../src/services/profiles.ts';
import { reconcile } from '../src/services/reconcile.ts';
import { recycleFiles, recycleFolder } from '../src/services/recycle.ts';
import { createTag, deleteTags, mergeTags, tagDetail } from '../src/services/tags.ts';
import { hashPending } from '../src/workers/hasher.ts';
import { fileByPath, folderByPath, star, starred, tempDir, tree } from './helpers.ts';

let lib: OpenLibrary;
let t: ReturnType<typeof tree>;
const id = (rel: string) => fileByPath(lib, rel)!.id;
const app = createApp(new Set(['http://localhost:4321']));

function call(method: string, url: string, body?: unknown) {
  return app.request(url, {
    method,
    headers: { Host: 'localhost:4321', Origin: 'http://localhost:4321', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Windows' user name as the first profile would take it. */
const osUser = () => os.userInfo().username.replace(/\s+/g, ' ').trim();

beforeEach(async () => {
  lib = createLibrary(path.join(tempDir(), 'Lib'));
  t = tree(lib);
  for (const n of ['a', 'b', 'c']) t.file(`Fantasy/Portraits/${n}.png`, n);
  await reconcile(lib);
  await hashPending(lib);
});

afterEach(() => closeLibrary());

describe('the first profile', () => {
  it('exists in a new library, named after the Windows user, in use, with this computer’s theme', () => {
    const [only] = listProfiles(lib);
    expect(listProfiles(lib)).toHaveLength(1);
    expect(only).toMatchObject({ name: osUser(), active: true, hasPassword: false });
    expect(activeProfile(lib).prefs).toMatchObject({ theme: 'darkroom', _import: true });
    expect(lib.db.prepare("SELECT 1 FROM settings WHERE key = 'profiles.nameFirst'").get()).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(lib.root, '.mediaview', 'library.json'), 'utf8')).formatVersion).toBe(2);
  });

  it('takes over the stars of a library from before profiles (migration 007)', () => {
    const root = lib.root;
    closeLibrary();
    // Rebuild the DB at migration 006, with two starred images and one not.
    const dbFile = path.join(root, '.mediaview', 'library.db');
    for (const f of ['', '-wal', '-shm']) fs.rmSync(dbFile + f, { force: true });
    const db = new Database(dbFile);
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((f) => Number(f.slice(0, 3)) <= 6).sort()) db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    db.exec(`INSERT INTO folders (id, uuid, module, kind, name, rel_path, created_at, updated_at) VALUES (1, 'u', 'images', 'inbox', 'Inbox', 'Inbox', 0, 0);
      INSERT INTO files (id, media_type, folder_id, category_id, filename, rel_path, ext, size, mtime, favorited, added_at) VALUES
        (1, 'image', 1, 1, 'a.png', 'Inbox/a.png', 'png', 1, 0, 1, 0),
        (2, 'image', 1, 1, 'b.png', 'Inbox/b.png', 'png', 1, 0, 0, 0),
        (3, 'image', 1, 1, 'c.png', 'Inbox/c.png', 'png', 1, 0, 1, 0);`);
    db.pragma('user_version = 6');
    db.close();
    const metaFile = path.join(root, '.mediaview', 'library.json');
    fs.writeFileSync(metaFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(metaFile, 'utf8')), formatVersion: 1 }));

    lib = openLibrary(root);
    const me = activeProfile(lib);
    expect(me.name).toBe(osUser());
    expect(lib.db.prepare('SELECT file_id FROM profile_favorites WHERE profile_id = ? ORDER BY file_id').pluck().all(me.id)).toEqual([1, 3]);
    expect(lib.db.prepare("SELECT 1 FROM pragma_table_info('files') WHERE name = 'favorited'").get()).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(metaFile, 'utf8')).formatVersion).toBe(2);
  });

  it('hands over the browser’s preferences once, keeping what the profile already has', () => {
    const me = lib.profileId!;
    expect(importPrefs(lib, me, { 'grid.cols': 8, theme: 'mochi' })).toEqual({ theme: 'darkroom', 'grid.cols': 8 });
    expect(importPrefs(lib, me, { 'grid.cols': 3 })).toEqual({ theme: 'darkroom', 'grid.cols': 8 });
  });

  it('drops values an older build saved that no longer fit, keeping the rest', async () => {
    const res = await call('POST', '/api/profiles/me/import-prefs', { 'grid.group': true, 'grid.cols': 99, 'viewer.loop': false, junk: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ theme: 'darkroom', 'viewer.loop': false });
  });
});

describe('profiles', () => {
  it('have unique names (case and _ vs. space don’t count)', async () => {
    await createProfile(lib, { name: 'Rubio Lima' });
    await expect(createProfile(lib, { name: 'rubio_lima' })).rejects.toThrow(/already a profile/);
    await expect(createProfile(lib, { name: '  ' })).rejects.toThrow(/required/);
    await expect(createProfile(lib, { name: 'x'.repeat(51) })).rejects.toThrow(/50 characters/);
  });

  it('hash passwords with scrypt, never store them as typed', async () => {
    const stored = await hashPassword('hunter2');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain('hunter2');
    expect(await checkPassword('hunter2', stored)).toBe(true);
    expect(await checkPassword('hunter3', stored)).toBe(false);
    expect(await hashPassword('hunter2')).not.toBe(stored); // a new salt each time
  });

  it('switch, asking a protected profile for its password (wrong ones answer late)', async () => {
    const rubio = await createProfile(lib, { name: 'Rubio', password: 'secret' });
    await expect(switchProfile(lib, rubio.id)).rejects.toMatchObject({ status: 403, code: 'PASSWORD_REQUIRED' });
    const started = Date.now();
    await expect(switchProfile(lib, rubio.id, 'nope')).rejects.toMatchObject({ status: 403, code: 'WRONG_PASSWORD' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(WRONG_PASSWORD_DELAY_MS - 20);
    expect((await switchProfile(lib, rubio.id, 'secret')).name).toBe('Rubio');
    expect(loadConfig().lastProfiles[lib.meta.id]).toBe(rubio.uuid);
  });

  it('open with the last one used here, unless it has a password', async () => {
    const root = lib.root;
    const ana = await createProfile(lib, { name: 'Ana' });
    await switchProfile(lib, ana.id);
    closeLibrary();
    lib = openLibrary(root);
    expect(lib.profileId).toBe(ana.id);

    await setPassword(lib, ana.id, undefined, 'pw');
    closeLibrary();
    lib = openLibrary(root);
    expect(lib.profileId).toBeNull();
  });

  it('change passwords only with the current one', async () => {
    const me = lib.profileId!;
    expect((await setPassword(lib, me, undefined, 'one')).hasPassword).toBe(true);
    await expect(setPassword(lib, me, undefined, 'two')).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' });
    await setPassword(lib, me, 'one', 'two');
    expect((await setPassword(lib, me, 'two', null)).hasPassword).toBe(false);
  });

  it('can be deleted, except the last one and the one in use; their stars and links go, collections stay', async () => {
    const me = lib.profileId!;
    await expect(deleteProfile(lib, me, me)).rejects.toMatchObject({ code: 'PROFILE_IN_USE' });
    const rubio = await createProfile(lib, { name: 'Rubio', password: 'pw' });
    await switchProfile(lib, rubio.id, 'pw');
    const a = id('Fantasy/Portraits/a.png');
    star(lib, a);
    const list = createCollection(lib, { name: 'Rubio’s refs' }, rubio.id);
    expect(collectionDetail(lib, list.id).createdBy).toEqual({ id: rubio.id, name: 'Rubio' });
    await switchProfile(lib, me);

    await expect(deleteProfile(lib, me, rubio.id)).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' });
    await deleteProfile(lib, me, rubio.id, 'pw');
    expect(starred(lib, a)).toBe(false);
    expect(collectionDetail(lib, list.id).createdBy).toBeNull();
    await expect(deleteProfile(lib, me, me)).rejects.toMatchObject({ code: 'PROFILE_IN_USE' });
  });

  it('keep preferences; the theme becomes this computer’s too', () => {
    const me = lib.profileId!;
    expect(updatePrefs(lib, me, { 'grid.cols': 4, theme: 'mochi' })).toMatchObject({ 'grid.cols': 4, theme: 'mochi' });
    expect(loadConfig().ui.theme).toBe('mochi');
  });

  it('rename and pick a picture from the library', () => {
    const a = id('Fantasy/Portraits/a.png');
    const me = updateProfile(lib, lib.profileId!, { name: 'Felipe', pictureFileId: a, color: '#3D8BFD' });
    expect(me).toMatchObject({ name: 'Felipe', pictureFileId: a, color: '#3d8bfd' });
    expect(me.picture?.id).toBe(a);
  });
});

describe('stars', () => {
  it('are per profile: each has its own Favorites', async () => {
    const [a, b] = [id('Fantasy/Portraits/a.png'), id('Fantasy/Portraits/b.png')];
    const me = lib.profileId!;
    const rubio = (await createProfile(lib, { name: 'Rubio' })).id;
    setFavorite(lib, me, [a], true);
    setFavorite(lib, rubio, [b], true);
    const favorites = (who: number) => listFiles(lib, { favorites: true, me: who, sort: 'name', order: 'asc' }).items.map((f) => f.filename);
    expect(favorites(me)).toEqual(['a.png']);
    expect(favorites(rubio)).toEqual(['b.png']);
    expect(listFiles(lib, { me, sort: 'name', order: 'asc' }).items.map((f) => f.favorited)).toEqual([true, false, false]);
    expect(listFiles(lib, { favorites: true, sort: 'name', order: 'asc' }).items).toEqual([]); // no profile, no favorites
  });

  it('protect images for everybody: recycling says who starred them', async () => {
    const [a, b] = [id('Fantasy/Portraits/a.png'), id('Fantasy/Portraits/b.png')];
    const me = lib.profileId!;
    const rubio = await createProfile(lib, { name: 'Rubio' });
    setFavorite(lib, rubio.id, [a], true);
    expect(recycleFiles(lib, [a, b], me)).toEqual({ recycled: 1, starred: [a], starredBy: [{ id: rubio.id, name: 'Rubio' }], mine: false });
    expect(() => recycleFolder(lib, folderByPath(lib, 'Fantasy/Portraits')!.id, me)).toThrow('“Portraits” contains 1 image starred by Rubio');
    setFavorite(lib, me, [a], true);
    expect(() => recycleFolder(lib, folderByPath(lib, 'Fantasy/Portraits')!.id, me)).toThrow(/1 image starred by .* and 1 by /);
  });

  it('all land on the kept copy when duplicates are merged', async () => {
    t.file('Fantasy/Court/a-copy.png', 'a');
    await reconcile(lib);
    await hashPending(lib);
    refreshDuplicates(lib.db);
    const [a, copy] = [id('Fantasy/Portraits/a.png'), id('Fantasy/Court/a-copy.png')];
    const me = lib.profileId!;
    const rubio = (await createProfile(lib, { name: 'Rubio' })).id;
    setFavorite(lib, me, [a], true);
    setFavorite(lib, rubio, [copy], true);
    updateProfile(lib, rubio, { pictureFileId: copy });
    const issue = healthReport(lib).issues.find((i) => i.kind === 'duplicate')!;
    expect(issue.details).toMatchObject({ reason: 'two-starred' });
    await expect(fixIssue(lib, issue.id, { action: 'keep-one', keepId: a })).rejects.toThrow('Another copy is starred by Rubio');
    await fixIssue(lib, issue.id, { action: 'merge', keepId: a });
    expect(lib.db.prepare('SELECT profile_id FROM profile_favorites WHERE file_id = ? ORDER BY profile_id').pluck().all(a)).toEqual([me, rubio]);
    expect(starred(lib, copy)).toBe(false);
    expect(profileInfo(lib, rubio).pictureFileId).toBe(a); // the picture follows too
  });
});

describe('tag links', () => {
  it('give a tag one profile per role', async () => {
    const me = lib.profileId!;
    const rubio = (await createProfile(lib, { name: 'Rubio' })).id;
    const art = createTag(lib, { name: 'felipe art' });
    expect(linkTag(lib, me, art.id, 'creator').map((x) => [x.name, x.role])).toEqual([['felipe art', 'creator']]);
    expect(() => linkTag(lib, rubio, art.id, 'creator')).toThrow('“felipe art” is already linked to');
    linkTag(lib, rubio, art.id, 'subject');
    expect(tagDetail(lib, art.id).links.map((l) => [l.profile.id, l.role])).toEqual([[me, 'creator'], [rubio, 'subject']]);
    expect(unlinkTag(lib, me, art.id, 'creator')).toEqual([]);
    expect(profileTags(lib, rubio)).toMatchObject([{ name: 'felipe art', typeKey: 'general', role: 'subject' }]);
  });

  it('follow tag merges (the target keeps its own on a clash) and go with deleted tags', async () => {
    const me = lib.profileId!;
    const rubio = (await createProfile(lib, { name: 'Rubio' })).id;
    const [x, y, z] = ['x', 'y', 'z'].map((name) => createTag(lib, { name }));
    linkTag(lib, me, x!.id, 'creator');
    linkTag(lib, me, x!.id, 'subject');
    linkTag(lib, rubio, y!.id, 'subject');
    mergeTags(lib, [x!.id], y!.id);
    expect(tagDetail(lib, y!.id).links.map((l) => [l.profile.id, l.role])).toEqual([[me, 'creator'], [rubio, 'subject']]);
    linkTag(lib, me, z!.id, 'subject');
    deleteTags(lib, [z!.id]);
    expect(profileTags(lib, me).map((l) => l.name)).toEqual(['y']);
  });
});

describe('collections', () => {
  it('remember who made them, through delete and Undo', async () => {
    const me = lib.profileId!;
    const list = createCollection(lib, { name: 'Refs' }, me);
    const snap = deleteCollection(lib, list.id);
    expect(restoreCollection(lib, snap).createdBy?.id).toBe(me);
  });
});

describe('without a profile chosen', () => {
  it('only the picker’s routes answer', async () => {
    lockProfile(lib);
    expect((await call('GET', '/api/files?folder=1')).status).toBe(401);
    expect(await (await call('GET', '/api/tags')).json()).toEqual({ error: { code: 'PROFILE_REQUIRED', message: 'Choose a profile first.' } });
    expect((await call('GET', '/api/library')).status).toBe(200);
    const list = await (await call('GET', '/api/profiles')).json();
    expect(list.active).toBeNull();
    expect((await call('POST', '/api/profiles/switch', { id: list.profiles[0].id })).status).toBe(200);
    expect((await call('GET', '/api/tags')).status).toBe(200);
  });
});

describe('logs', () => {
  const lines = () => {
    flush();
    const dir = getLogDir()!;
    return fs.readdirSync(dir).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n')).map((l) => JSON.parse(l));
  };

  it('say who made a request once the library has more than one profile', async () => {
    const [a, b] = [id('Fantasy/Portraits/a.png'), id('Fantasy/Portraits/b.png')];
    await call('POST', '/api/files/favorite', { ids: [a, b], favorited: true });
    expect(lines().find((l) => l.msg === 'bulk favorite').profile).toBeUndefined();

    await createProfile(lib, { name: 'Rubio' });
    await call('POST', '/api/files/favorite', { ids: [a, b], favorited: false });
    const me = activeProfile(lib);
    expect(lines().find((l) => l.msg === 'bulk unfavorite').profile).toEqual({ uuid: me.uuid, name: me.name });
  });
});
