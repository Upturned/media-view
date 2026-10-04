import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectionToken, parseQuery, setEntryState } from '@media-view/shared';
import {
  addItems, collectionDetail, createCollection, deleteCollection, listCollections, membership, moveItems, removeItems,
  restoreCollection, setOrder, updateCollection,
} from '../src/services/collections.ts';
import { collectionCounts, fileDetail, listFiles, listGrouped, locateFile } from '../src/services/files.ts';
import { closeLibrary, createLibrary, type OpenLibrary } from '../src/services/library.ts';
import { reconcile } from '../src/services/reconcile.ts';
import { recycleFiles } from '../src/services/recycle.ts';
import { changeFileTags, createTag } from '../src/services/tags.ts';
import { fileByPath, tempDir, tree } from './helpers.ts';

let lib: OpenLibrary;

beforeEach(async () => {
  lib = createLibrary(path.join(tempDir(), 'Lib'));
  const t = tree(lib);
  for (const n of ['a', 'b', 'c', 'd', 'e']) t.file(`Fantasy/Portraits/${n}.png`, n);
  await reconcile(lib);
});

afterEach(() => closeLibrary());

const file = (n: string) => fileByPath(lib, `Fantasy/Portraits/${n}.png`)!.id;
const names = (items: { filename: string }[]) => items.map((i) => i.filename.replace('.png', ''));
const own = (collection: number) => names(listFiles(lib, { collection, sort: 'position', order: 'asc' }).items);

describe('collections', () => {
  it('creates lists with unique names (case and space vs. _ don’t count)', () => {
    const c = createCollection(lib, { name: 'Chapter 3 refs', description: '  The rain chapter.  ' });
    expect(c).toMatchObject({ name: 'Chapter 3 refs', description: 'The rain chapter.', count: 0, covers: [] });
    expect(() => createCollection(lib, { name: 'chapter_3_REFS' })).toThrow(/already exists/);
    expect(() => createCollection(lib, { name: 'say "hi"' })).toThrow(/can’t contain/);
    expect(() => createCollection(lib, { name: 'x', description: 'y'.repeat(501) })).toThrow(/500/);
    // Renaming to itself (in another case) is fine.
    expect(updateCollection(lib, c.id, { name: 'CHAPTER 3 refs' }).name).toBe('CHAPTER 3 refs');
  });

  it('adds at the end, reports duplicates, reorders and removes', () => {
    const c = createCollection(lib, { name: 'Refs' });
    expect(addItems(lib, c.id, [file('c'), file('a')])).toEqual({ added: 2, already: 0 });
    expect(addItems(lib, c.id, [file('a'), file('e'), file('b')])).toEqual({ added: 2, already: 1 });
    expect(own(c.id)).toEqual(['c', 'a', 'e', 'b']);

    moveItems(lib, c.id, [file('b'), file('c')], file('a')); // relative order kept: c, b
    expect(own(c.id)).toEqual(['c', 'b', 'a', 'e']);
    moveItems(lib, c.id, [file('c')], null);
    expect(own(c.id)).toEqual(['b', 'a', 'e', 'c']);
    // Dropped onto one of the moved images: lands before the next one that stays.
    moveItems(lib, c.id, [file('a'), file('e')], file('e'));
    expect(own(c.id)).toEqual(['b', 'a', 'e', 'c']);

    expect(removeItems(lib, c.id, [file('a')])).toMatchObject({ removed: 1 });
    expect(own(c.id)).toEqual(['b', 'e', 'c']);
    expect(listFiles(lib, { collection: c.id, sort: 'name', order: 'asc' }).items.map((i) => i.position)).toEqual([1, 3, 2]);
    expect(fileDetail(lib, file('b')).collections).toMatchObject([{ id: c.id, name: 'Refs', position: 1, total: 3 }]);
    expect(listFiles(lib, { collection: c.id, sort: 'position', order: 'asc' }).items[0]!.where).toBe('Fantasy › Portraits');

    // Undo: the exact order back, with removed images re-added.
    const { previous } = moveItems(lib, c.id, [file('c')], file('b'));
    removeItems(lib, c.id, [file('e')]);
    setOrder(lib, c.id, [...previous, file('a')]);
    expect(own(c.id)).toEqual(['b', 'e', 'c', 'a']);
    expect(collectionDetail(lib, c.id).albums).toEqual([{ id: fileByPath(lib, 'Fantasy/Portraits/a.png')!.folder_id, name: 'Portraits', path: 'Fantasy › Portraits', count: 4 }]);
  });

  it('covers: the chosen one, else the first image; a removed cover falls back', () => {
    const c = createCollection(lib, { name: 'Refs' });
    addItems(lib, c.id, ['a', 'b', 'c', 'd', 'e'].map(file));
    expect(collectionDetail(lib, c.id).covers.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e'].map(file));
    expect(() => updateCollection(lib, c.id, { coverFileId: 99999 })).toThrow(/on this list/);
    updateCollection(lib, c.id, { coverFileId: file('d') });
    expect(collectionDetail(lib, c.id).covers.map((t) => t.id)).toEqual(['d', 'a', 'b', 'c', 'e'].map(file));
    removeItems(lib, c.id, [file('d')]);
    expect(collectionDetail(lib, c.id)).toMatchObject({ coverFileId: null, count: 4 });
  });

  it('recycled images keep their place but don’t count', () => {
    const c = createCollection(lib, { name: 'Refs' });
    addItems(lib, c.id, ['a', 'b', 'c'].map(file));
    const b = file('b');
    recycleFiles(lib, [b]);
    expect(collectionDetail(lib, c.id).count).toBe(2);
    expect(listFiles(lib, { collection: c.id, sort: 'position', order: 'asc' }).items.map((i) => i.position)).toEqual([1, 2]);
    expect(addItems(lib, c.id, [b])).toEqual({ added: 0, already: 1 });
  });

  it('delete returns a snapshot that undo restores, with the same id', () => {
    const c = createCollection(lib, { name: 'Refs', description: 'd' });
    addItems(lib, c.id, ['c', 'a'].map(file));
    updateCollection(lib, c.id, { coverFileId: file('a') });
    const snap = deleteCollection(lib, c.id);
    expect(listCollections(lib)).toEqual([]);
    const back = restoreCollection(lib, snap);
    expect(back).toMatchObject({ id: c.id, name: 'Refs', description: 'd', coverFileId: file('a'), count: 2 });
    expect(own(c.id)).toEqual(['c', 'a']);
  });

  it('lists with filter, sort, tag counts and membership', () => {
    const one = createCollection(lib, { name: 'Wallpapers' });
    const two = createCollection(lib, { name: 'Court outfits — final pass' });
    addItems(lib, one.id, ['a', 'b', 'c'].map(file));
    addItems(lib, two.id, ['c'].map(file));
    expect(listCollections(lib, { q: 'court_out' }).map((c) => c.name)).toEqual(['Court outfits — final pass']);
    expect(listCollections(lib, { sort: 'count', order: 'desc' }).map((c) => c.count)).toEqual([3, 1]);

    const rain = createTag(lib, { name: 'rain' });
    changeFileTags(lib, [file('c'), file('b')], [rain.id], []);
    expect(listCollections(lib, { tag: rain.id }).map((c) => [c.name, c.tagged])).toEqual([['Wallpapers', 2], ['Court outfits — final pass', 1]]);
    expect(membership(lib, [file('c'), file('d')]).sort((x, y) => x.id - y.id)).toEqual([{ id: one.id, count: 1 }, { id: two.id, count: 1 }]);
  });
});

describe('collections in searches and grids', () => {
  let wall: number;
  let court: number;
  beforeEach(() => {
    wall = createCollection(lib, { name: 'Wallpapers' }).id;
    court = createCollection(lib, { name: 'Court outfits — final pass' }).id;
    addItems(lib, wall, ['b', 'a'].map(file));
    addItems(lib, court, ['c', 'a'].map(file));
  });
  const search = (q: string) => names(listFiles(lib, { q, sort: 'name', order: 'asc' }).items);

  it('parses @name and @"quoted name"', () => {
    expect(parseQuery('@chapter_3 -@"Court outfits — final pass" ~@x', [])).toMatchObject([
      { kind: 'collection', op: 'must', name: 'chapter 3' },
      { kind: 'collection', op: 'never', name: 'Court outfits — final pass' },
      { kind: 'collection', op: 'any', name: 'x' },
    ]);
    expect(collectionToken('must', 'Chapter 3 refs')).toBe('@Chapter_3_refs');
    expect(collectionToken('never', 'Court outfits — final pass')).toBe('-@"Court outfits — final pass"');
    expect(setEntryState('#rain @wallpapers', [], { kind: 'collection', name: 'Wallpapers' }, 'never')).toBe('#rain -@Wallpapers');
  });

  it('filters by collection: must, never, any of (with tags), unknown names', () => {
    expect(search('@wallpapers')).toEqual(['a', 'b']);
    expect(search('-@WALLPAPERS')).toEqual(['c', 'd', 'e']);
    expect(search('@"court outfits — final pass" -@wallpapers')).toEqual(['c']);
    const rain = createTag(lib, { name: 'rain' });
    changeFileTags(lib, [file('e')], [rain.id], []);
    expect(search('~@court_outfits_—_final_pass ~#rain')).toEqual(['a', 'c', 'e']);
    expect(listFiles(lib, { q: '@nope', sort: 'name', order: 'asc' })).toMatchObject({ total: 0, unknown: ['@nope'] });
  });

  it('counts collections over a list and steps through a collection in order', () => {
    expect(collectionCounts(lib, { sort: 'name', order: 'asc' })).toEqual({
      collections: [{ id: court, name: 'Court outfits — final pass', count: 2, size: 2 }, { id: wall, name: 'Wallpapers', count: 2, size: 2 }],
      none: 2,
    });
    expect(collectionCounts(lib, { q: '-@wallpapers', sort: 'name', order: 'asc' }).collections.map((c) => [c.name, c.count]))
      .toEqual([['Court outfits — final pass', 1], ['Wallpapers', 0]]);
    expect(locateFile(lib, { collection: wall, sort: 'position', order: 'asc' }, file('a'))).toEqual({ index: 1, total: 2 });
  });

  it('groups by collection: sections by name, own order (reversible), the rest last', () => {
    const rows = (rev: number[] = []) => listGrouped(lib, { sort: 'name', order: 'asc' }, rev).items
      .map((i) => `${i.group?.name.slice(0, 5) ?? '-'}:${i.filename.replace('.png', '')}${i.position ? `#${i.position}` : ''}${i.listed > 1 ? '*' : ''}`);
    expect(rows()).toEqual(['Court:c#1', 'Court:a#2*', 'Wallp:b#1', 'Wallp:a#2*', '-:d', '-:e']);
    expect(rows([wall])).toEqual(['Court:c#1', 'Court:a#2*', 'Wallp:a#2*', 'Wallp:b#1', '-:d', '-:e']);
    expect(listGrouped(lib, { sort: 'name', order: 'asc' }, [], 2, 3).total).toBe(6);
  });
});
