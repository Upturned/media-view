import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DuplicateCopy, HealthIssue, IssueKind } from '@media-view/shared';
import { readMarker } from '../src/lib/markers.ts';
import { addItems, createCollection } from '../src/services/collections.ts';
import { fileDetail, listFiles } from '../src/services/files.ts';
import { cleanThumbnails, fixAll, fixEverything, fixIssue, healthReport, healthSummary, reopenIssue, setUntaggedFlags, suggestKeep, untaggedImages, untrackedAction } from '../src/services/health.ts';
import { refreshDuplicates } from '../src/services/issues.ts';
import { closeLibrary, createLibrary, type OpenLibrary } from '../src/services/library.ts';
import { reconcile } from '../src/services/reconcile.ts';
import { listBin, restore } from '../src/services/recycle.ts';
import { changeFileTags, createTag } from '../src/services/tags.ts';
import { hashPending } from '../src/workers/hasher.ts';
import { scanStatus } from '../src/workers/scanner.ts';
import { fileByPath, folderByPath, tempDir, tree } from './helpers.ts';

let lib: OpenLibrary;
let t: ReturnType<typeof tree>;

/** Scan, then hash everything (as the background hasher would). */
async function scan() {
  await reconcile(lib);
  await hashPending(lib);
}

/** Fixes that change the folder tree ask for a rescan: wait for it, then scan once more ourselves. */
async function settle() {
  for (let i = 0; i < 200 && scanStatus(lib).status === 'scanning'; i++) await new Promise((r) => setTimeout(r, 10));
  await scan();
}

const issue = (kind: IssueKind, match: (i: HealthIssue) => boolean = () => true) => healthReport(lib).issues.find((i) => i.kind === kind && match(i));
const id = (rel: string) => fileByPath(lib, rel)!.id;

beforeEach(async () => {
  lib = createLibrary(path.join(tempDir(), 'Lib'));
  t = tree(lib);
  for (const n of ['a', 'b', 'c']) t.file(`Fantasy/Portraits/${n}.png`, n);
  t.file('Fantasy/Court/d.png', 'd');
  await scan();
});

afterEach(() => closeLibrary());

describe('untagged images', () => {
  it('lists untagged images outside the Inbox; only later arrivals are NEW', async () => {
    t.file('Inbox/in.png', 'in');
    t.file('Fantasy/Court/e.png', 'e');
    await scan();
    expect(healthSummary(lib)).toMatchObject({ untagged: 5, fresh: 1 });
    expect(untaggedImages(lib, { fresh: true }).items.map((i) => [i.filename, i.where, i.isNew])).toEqual([['e.png', 'Fantasy › Court', true]]);
    expect(untaggedImages(lib, {}).items.map((i) => i.filename)).toEqual(['d.png', 'e.png', 'a.png', 'b.png', 'c.png']);
    expect(healthReport(lib).untaggedAlbums.map((a) => [a.path, a.count, a.fresh])).toEqual([['Fantasy › Portraits', 3, 0], ['Fantasy › Court', 2, 1]]);
    expect(listFiles(lib, { untagged: true, fresh: true, sort: 'name', order: 'asc' }).total).toBe(1);
  });

  it('mark as seen and leave untagged are separate; tagging clears both', async () => {
    t.file('Fantasy/Court/e.png', 'e');
    await scan();
    setUntaggedFlags(lib, 'all', 'seen');
    expect(healthSummary(lib)).toMatchObject({ untagged: 5, fresh: 0 });
    setUntaggedFlags(lib, [id('Fantasy/Portraits/a.png')], 'leave');
    expect(healthSummary(lib).untagged).toBe(4);
    const rain = createTag(lib, { name: 'rain' });
    changeFileTags(lib, [id('Fantasy/Portraits/a.png'), id('Fantasy/Portraits/b.png')], [rain.id], []);
    expect(healthSummary(lib).untagged).toBe(3);
    changeFileTags(lib, [id('Fantasy/Portraits/a.png')], [], [rain.id]);
    expect(healthSummary(lib).untagged).toBe(4); // tagged once: "leave untagged" was cleared
  });
});

describe('missing folders and images', () => {
  it('recreates a missing folder with its marker', async () => {
    const court = folderByPath(lib, 'Fantasy/Court')!;
    t.remove('Fantasy/Court');
    await scan();
    const i = issue('missing_folder')!;
    expect(i.details).toMatchObject({ path: 'Fantasy/Court', images: 1 });
    await fixIssue(lib, i.id, { action: 'recreate' });
    expect(readMarker(t.abs('Fantasy/Court'))?.folder).toBe(court.uuid);
    expect(issue('missing_folder')).toBeUndefined();
    expect(issue('missing_file')).toBeDefined(); // its image is still gone
  });

  it('forgets a missing folder with its images', async () => {
    t.remove('Fantasy/Court');
    await scan();
    expect(await fixIssue(lib, issue('missing_folder')!.id, { action: 'forget' })).toMatchObject({ message: 'Forgot Court and 1 image in it.' });
    expect(folderByPath(lib, 'Fantasy/Court')).toBeUndefined();
    expect(issue('missing_file')).toBeUndefined();
  });

  it('locates a missing image only by its content', async () => {
    const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mv-locate-')), 'found.png');
    fs.renameSync(t.abs('Fantasy/Portraits/b.png'), outside);
    const wrong = path.join(path.dirname(outside), 'other.png');
    fs.writeFileSync(wrong, 'something else');
    await scan();
    const i = issue('missing_file')!;
    await expect(fixIssue(lib, i.id, { action: 'locate', path: wrong })).rejects.toThrow(/different image/);
    await fixIssue(lib, i.id, { action: 'locate', path: outside });
    const f = fileDetail(lib, i.details.kind === 'missing_file' ? i.details.fileId : 0);
    expect(f.relPath).toBe('Fantasy/Portraits/b.png');
    expect(fs.existsSync(outside)).toBe(true); // copied back, the original left alone
  });
});

describe('changes made outside the app', () => {
  it('undoes a folder moved in Explorer', async () => {
    t.move('Fantasy/Court', 'Fantasy/Throne room');
    await scan();
    const i = issue('external_move')!;
    expect(i.details).toMatchObject({ entity: 'folder', from: 'Fantasy/Court', to: 'Fantasy/Throne room' });
    await fixIssue(lib, i.id, { action: 'undo' });
    expect(fs.existsSync(t.abs('Fantasy/Court/d.png'))).toBe(true);
    expect(fileByPath(lib, 'Fantasy/Court/d.png')).toBeDefined();
    await settle();
    expect(issue('external_move')).toBeUndefined();
  });

  it('resolves an unclear move by picking the record (its tags come back)', async () => {
    t.file('Fantasy/Court/a-twin.png', 'a'); // identical to Portraits/a.png
    await scan();
    const [a, twin] = [id('Fantasy/Portraits/a.png'), id('Fantasy/Court/a-twin.png')];
    const rain = createTag(lib, { name: 'rain' });
    changeFileTags(lib, [twin], [rain.id], []);
    t.remove('Fantasy/Portraits/a.png');
    t.remove('Fantasy/Court/a-twin.png');
    await scan();
    t.file('Fantasy/Court/back.png', 'a');
    await scan();
    const i = issue('ambiguous_move')!;
    expect(i.details.kind === 'ambiguous_move' && i.details.candidates.map((c) => c.id).sort()).toEqual([a, twin].sort());
    await fixIssue(lib, i.id, { action: 'pick', candidateId: twin });
    expect(fileDetail(lib, twin)).toMatchObject({ relPath: 'Fantasy/Court/back.png', tags: [{ name: 'rain' }] });
    expect(issue('missing_file', (x) => x.details.kind === 'missing_file' && x.details.fileId === twin)).toBeUndefined();
    expect(issue('missing_file', (x) => x.details.kind === 'missing_file' && x.details.fileId === a)).toBeDefined();
  });

  it('keeps a change, and Undo of Keep brings the item back', async () => {
    t.move('Fantasy/Portraits/a.png', 'Fantasy/Court/a.png');
    await scan();
    const i = issue('external_move')!;
    expect(i.details).toMatchObject({ entity: 'files', fromFolder: 'Fantasy/Portraits', toFolder: 'Fantasy/Court' });
    const r = await fixIssue(lib, i.id, { action: 'keep' });
    expect(issue('external_move')).toBeUndefined();
    reopenIssue(lib, r.reopen!);
    expect(issue('external_move')).toBeDefined();
    expect(await fixAll(lib, 'external_move', 'undo')).toMatchObject({ done: 1, skipped: 0 });
    expect(fs.existsSync(t.abs('Fantasy/Portraits/a.png'))).toBe(true);
  });
});

describe('rule problems and wrong types', () => {
  it('puts loose images into a new album', async () => {
    t.file('Fantasy/loose.png', 'loose');
    await scan();
    await fixIssue(lib, issue('loose_files')!.id, { action: 'new-album', name: 'Strays' });
    expect(fileByPath(lib, 'Fantasy/Strays/loose.png')).toBeDefined();
  });

  it('moves a folder out of an album, next to it', async () => {
    t.file('Fantasy/Portraits/Sketches/s.png', 's');
    await scan();
    const i = issue('nested_in_album')!;
    expect(i.details).toMatchObject({ path: 'Fantasy/Portraits/Sketches', moveOutTo: 'Fantasy' });
    await fixIssue(lib, i.id, { action: 'move-out' });
    await settle();
    expect(fileByPath(lib, 'Fantasy/Sketches/s.png')).toBeDefined();
    expect(issue('nested_in_album')).toBeUndefined();
  });

  it('confirms or changes a guessed folder kind', async () => {
    t.dir('Fantasy/Empty');
    await scan();
    const i = issue('unmarked_folder', (x) => x.details.kind === 'unmarked_folder' && x.details.path === 'Fantasy/Empty')!;
    expect(i.details).toMatchObject({ current: 'album', certain: false });
    await fixIssue(lib, i.id, { action: 'confirm', folderKind: 'subcategory' });
    expect(folderByPath(lib, 'Fantasy/Empty')!.kind).toBe('subcategory');
    expect(readMarker(t.abs('Fantasy/Empty'))?.kind).toBe('subcategory');
  });

  it('moves videos to their module by itself, with a notice; other files are recycled (restorable)', async () => {
    t.file('Fantasy/Portraits/clip.mp4', 'video');
    t.file('Fantasy/Portraits/notes.xyz', 'junk');
    await scan();
    expect(fs.existsSync(path.join(lib.moduleRoot('videos'), 'Fantasy', 'Portraits', 'clip.mp4'))).toBe(true);
    const notice = issue('moved_file')!;
    expect(notice).toMatchObject({ severity: 'notice', details: { from: 'Fantasy/Portraits/clip.mp4', to: 'Videos/Fantasy/Portraits/clip.mp4' } });
    expect(healthSummary(lib).notice).toBe(1);
    await fixIssue(lib, notice.id, { action: 'ok' });
    expect(issue('moved_file')).toBeUndefined();

    await fixIssue(lib, issue('wrong_type')!.id, { action: 'recycle' });
    const bin = listBin(lib);
    expect(bin.map((b) => [b.entity, b.name])).toEqual([['other', 'notes.xyz']]);
    restore(lib, bin[0]!.id);
    expect(fs.existsSync(t.abs('Fantasy/Portraits/notes.xyz'))).toBe(true);
  });

  it('unsupported formats: Ignore keeps the file (Not tracked), Record moves it; both are counted', async () => {
    t.file('Fantasy/Portraits/scene.psd', 'psd 1');
    t.file('Fantasy/Portraits/sketch.psd', 'psd 2');
    t.file('Fantasy/Court/photo.heic', 'heic');
    await scan();
    const psd = (name: string) => issue('unsupported', (x) => x.details.kind === 'unsupported' && x.details.path.endsWith(name))!;
    await fixIssue(lib, psd('scene.psd').id, { action: 'ignore' });
    await fixIssue(lib, psd('sketch.psd').id, { action: 'record' });
    await scan();
    expect(fs.existsSync(t.abs('Fantasy/Portraits/scene.psd'))).toBe(true); // ignored: left in place, not reported again
    expect(fs.existsSync(path.join(lib.root, '.mediaview', 'Invalid', 'Fantasy', 'Portraits', 'sketch.psd'))).toBe(true);
    const report = healthReport(lib);
    expect(report.issues.filter((i) => i.kind === 'unsupported').map((i) => i.details.kind === 'unsupported' && i.details.ext)).toEqual(['heic']);
    expect(report.untracked).toMatchObject([{ path: 'Fantasy/Portraits/scene.psd', ext: 'psd', reason: 'unsupported' }]);
    expect(report.formatStats).toEqual([{ ext: 'psd', ignored: 1, recorded: 1 }]);

    untrackedAction(lib, ['Fantasy/Portraits/scene.psd'], 'track');
    expect(healthReport(lib).untracked).toEqual([]);
    expect(psd('scene.psd')).toBeDefined();
  });

  it('never asks about a new top-level folder (always a category)', async () => {
    t.file('Sci-fi/Ships/s.png', 's');
    await scan();
    expect(issue('unmarked_folder', (x) => x.details.kind === 'unmarked_folder' && x.details.path === 'Sci-fi')).toBeUndefined();
    expect(issue('unmarked_folder', (x) => x.details.kind === 'unmarked_folder' && x.details.path === 'Sci-fi/Ships')).toBeDefined();
  });
});

describe('items shown inside others, and Apply to all', () => {
  it('a missing folder is one item for its folders and images; Recreate brings back the folders inside', async () => {
    t.file('Fantasy/Elves/Court/p.png', 'p');
    t.file('Fantasy/Elves/Court/q.png', 'q');
    await scan();
    t.remove('Fantasy/Elves');
    await scan();
    const report = healthReport(lib);
    const missing = report.issues.filter((i) => i.kind === 'missing_folder' || i.kind === 'missing_file');
    expect(missing.map((i) => i.details)).toMatchObject([{ kind: 'missing_folder', path: 'Fantasy/Elves', folders: 1, images: 2 }]);
    expect(report.summary.error).toBe(1);
    await fixIssue(lib, missing[0]!.id, { action: 'recreate' });
    expect(fs.existsSync(t.abs('Fantasy/Elves/Court'))).toBe(true);
    expect(healthReport(lib).issues.filter((i) => i.kind === 'missing_file')).toHaveLength(2); // now ordinary missing images
  });

  it('Apply to all (red and amber) uses each default and counts what needs a choice', async () => {
    t.move('Fantasy/Portraits/a.png', 'Fantasy/Court/a.png'); // changed outside → Keep
    t.file('Fantasy/stray.png', 'stray'); // loose → "Loose images"
    t.file('Fantasy/Portraits/scene.psd', 'psd'); // unsupported → needs a choice
    await scan();
    const r = await fixEverything(lib);
    // Keep, the new album, and the two kinds the first scan guessed (Portraits, Court); the PSD waits.
    expect(r).toMatchObject({ done: 4, skipped: 1, failed: [] });
    expect(fileByPath(lib, 'Fantasy/Loose images/stray.png')).toBeDefined();
    expect(issue('external_move')).toBeUndefined();
  });

  it('Leave untagged can be put back', () => {
    setUntaggedFlags(lib, [id('Fantasy/Portraits/a.png')], 'leave');
    expect(healthReport(lib).leftUntagged).toBe(1);
    expect(untaggedImages(lib, { left: true }).items.map((i) => i.filename)).toEqual(['a.png']);
    setUntaggedFlags(lib, 'all', 'put-back');
    expect(healthSummary(lib).untagged).toBe(4);
  });
});

describe('thumbnails', () => {
  it('cleans cached thumbnails no image uses', () => {
    const dir = path.join(lib.root, '.mediaview', 'thumbnails', 'ff');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${'f'.repeat(64)}.webp`), 'x'.repeat(10));
    expect(healthReport(lib).thumbnails).toEqual({ count: 1, bytes: 10 });
    expect(cleanThumbnails(lib)).toEqual({ deleted: 1, bytes: 10 });
    expect(healthReport(lib).thumbnails.count).toBe(0);
  });
});

describe('duplicates', () => {
  const copy = (id: number, tags: number[], favorited = false): DuplicateCopy =>
    ({ id, path: '', folderId: 1, tags: tags.map((x) => ({ id: x, typeId: 1, name: String(x) })), favorited, collections: [], description: null, addedAt: id });

  it('suggests which copy to keep', () => {
    expect(suggestKeep([copy(1, []), copy(2, [])])).toEqual({ keepId: 1, reason: 'oldest' });
    expect(suggestKeep([copy(1, []), copy(2, [7])])).toEqual({ keepId: 2, reason: 'only-tagged' });
    expect(suggestKeep([copy(1, [7]), copy(2, [7]), copy(3, [])])).toEqual({ keepId: 1, reason: 'oldest' });
    expect(suggestKeep([copy(1, [7]), copy(2, [8])])).toEqual({ keepId: null, reason: 'different-tags' });
    expect(suggestKeep([copy(1, []), copy(2, [], true)])).toEqual({ keepId: 2, reason: 'starred' });
    expect(suggestKeep([copy(1, [7]), copy(2, [], true)])).toEqual({ keepId: 2, reason: 'different-tags' }); // suggested, but still asks
    expect(suggestKeep([copy(1, [], true), copy(2, [], true)])).toEqual({ keepId: null, reason: 'two-starred' });
  });

  it('merges copies with different tags into one', async () => {
    t.file('Fantasy/Court/a-copy.png', 'a');
    await scan();
    refreshDuplicates(lib.db);
    const a = id('Fantasy/Portraits/a.png');
    const dup = id('Fantasy/Court/a-copy.png');
    const [rain, cape] = [createTag(lib, { name: 'rain' }), createTag(lib, { name: 'cape' })];
    changeFileTags(lib, [a], [rain.id], []);
    changeFileTags(lib, [dup], [cape.id], []);
    const list = createCollection(lib, { name: 'Refs' });
    addItems(lib, list.id, [id('Fantasy/Portraits/b.png'), dup]);

    const i = issue('duplicate')!;
    expect(i.details).toMatchObject({ keepId: null, reason: 'different-tags' });
    await expect(fixAll(lib, 'duplicate', 'keep-one')).resolves.toMatchObject({ done: 0, skipped: 1 });
    await fixIssue(lib, i.id, { action: 'merge', keepId: a });
    const kept = fileDetail(lib, a);
    expect(kept.tags.map((x) => x.name).sort()).toEqual(['cape', 'rain']);
    expect(kept.collections).toMatchObject([{ name: 'Refs', position: 2 }]);
    expect(listBin(lib).map((b) => b.name)).toEqual(['a-copy.png']);
    expect(issue('duplicate')).toBeUndefined();
  });
});
