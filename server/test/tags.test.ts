import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFiles } from '../src/services/file-ops.ts';
import { listFiles, tagCounts, type FileQuery } from '../src/services/files.ts';
import { closeLibrary, createLibrary, type OpenLibrary } from '../src/services/library.ts';
import { reconcile } from '../src/services/reconcile.ts';
import {
  addAlias, addImplication, changeFileTags, createTag, createType, deleteTags, deleteType, implicationImpact, listTypes,
  makeMainName, mergeTags, moveType, removeImplication, suggestTags, tagCoverage, tagDetail, tagsOfFile, updateTag, updateType,
} from '../src/services/tags.ts';
import { fileByPath, folderByPath, tempDir, tree } from './helpers.ts';

let lib: OpenLibrary;

beforeEach(async () => {
  lib = createLibrary(path.join(tempDir(), 'Lib'));
  const t = tree(lib);
  for (const n of ['a', 'b', 'c', 'd']) t.file(`Fantasy/Portraits/${n}.png`, n);
  t.file('Fantasy/Maps/beach map.png', 'm');
  t.dir('Fantasy/Other');
  await reconcile(lib);
});

afterEach(() => closeLibrary());

const file = (n: string) => fileByPath(lib, `Fantasy/Portraits/${n}.png`)!.id;
const type = (key: string) => listTypes(lib).find((t) => t.key === key)!.id;
const names = (fileId: number) => tagsOfFile(lib.db, fileId).map((t) => `${t.name}${t.source === 'implied' ? '*' : ''}`).sort();
const query = (q: string, extra: Partial<FileQuery> = {}) =>
  listFiles(lib, { sort: 'name', order: 'asc', q, ...extra }).items.map((f) => f.filename);

describe('tag types', () => {
  it('creates, renames (key follows), reorders and protects types in use', () => {
    const t = createType(lib, { name: 'Body Parts', color: '#123456' });
    expect(t.key).toBe('body_parts');
    expect(updateType(lib, t.id, { name: 'Anatomy' }).key).toBe('anatomy');
    expect(moveType(lib, t.id, -1).map((x) => x.key)).toEqual(['general', 'character', 'source', 'anatomy', 'artist']);

    createTag(lib, { name: 'hands', typeId: t.id });
    expect(() => deleteType(lib, t.id)).toThrow(/still has 1 tag/);
    expect(() => deleteType(lib, type('general'))).toThrow(/default/);
    updateType(lib, t.id, { isDefault: true });
    expect(listTypes(lib).filter((x) => x.isDefault).map((x) => x.key)).toEqual(['anatomy']);
  });
});

describe('tags and aliases', () => {
  it('treats spaces and underscores alike and refuses duplicates in a type', () => {
    const t = createTag(lib, { name: 'red_dress' });
    expect(t.name).toBe('red dress');
    expect(() => createTag(lib, { name: 'Red Dress' })).toThrow(/already exists/);
    // The same name in another type is a different tag.
    expect(createTag(lib, { name: 'character:red dress' }).typeId).toBe(type('character'));
    expect(() => createTag(lib, { name: 'a:b:c' })).toThrow(/can’t contain/);
  });

  it('aliases resolve, can become the main name, and never collide with tags', () => {
    const lotr = createTag(lib, { name: 'source:the lord of the rings' });
    addAlias(lib, lotr.id, 'lotr');
    createTag(lib, { name: 'source:hobbit' });
    expect(() => addAlias(lib, lotr.id, 'hobbit')).toThrow(/merge it instead/);
    expect(() => createTag(lib, { name: 'source:LOTR' })).toThrow(/alias of/);

    const main = makeMainName(lib, lotr.id, 'lotr');
    expect(main).toMatchObject({ id: lotr.id, name: 'lotr', aliases: ['the lord of the rings'] });
    // Renaming to one of its own aliases swaps them back.
    expect(updateTag(lib, lotr.id, { name: 'the lord of the rings' }).aliases).toEqual([]);

    expect(suggestTags(lib, 'lo')[0]).toMatchObject({ id: lotr.id });
  });
});

describe('tagging images and implications', () => {
  it('materializes implied tags, chains them, and refuses loops', () => {
    const frodo = createTag(lib, { name: 'character:frodo' });
    const lotr = createTag(lib, { name: 'source:lotr' });
    const fantasy = createTag(lib, { name: 'fantasy' });
    changeFileTags(lib, [file('a'), file('b')], [frodo.id], []);

    expect(implicationImpact(lib, frodo.id, lotr.id, 'add')).toEqual({ affected: 2 });
    addImplication(lib, frodo.id, lotr.id);
    addImplication(lib, lotr.id, fantasy.id);
    expect(names(file('a'))).toEqual(['fantasy*', 'frodo', 'lotr*']);
    expect(() => addImplication(lib, fantasy.id, frodo.id)).toThrow(/loop/);

    // Manually adding an implied tag makes it manual; removing the manual link leaves it implied.
    changeFileTags(lib, [file('a')], [lotr.id], []);
    expect(names(file('a'))).toEqual(['fantasy*', 'frodo', 'lotr']);
    changeFileTags(lib, [file('a')], [], [lotr.id]);
    expect(names(file('a'))).toEqual(['fantasy*', 'frodo', 'lotr*']);

    // Removing the implication takes the implied tags off existing images.
    expect(implicationImpact(lib, frodo.id, lotr.id, 'remove')).toEqual({ affected: 2 });
    removeImplication(lib, frodo.id, lotr.id);
    expect(names(file('b'))).toEqual(['frodo']);

    expect(tagCoverage(lib, [file('a'), file('b'), file('c')]).map((c) => [c.name, c.count, c.impliedOnly])).toEqual([['frodo', 2, false]]);
  });

  it('merges tags: images, aliases and implications move over', () => {
    const lotrA = createTag(lib, { name: 'source:lotr' });
    const lotrB = createTag(lib, { name: 'source:the lord of the rings' });
    const frodo = createTag(lib, { name: 'character:frodo' });
    const fantasy = createTag(lib, { name: 'fantasy' });
    addAlias(lib, lotrA.id, 'lord of the rings');
    addImplication(lib, frodo.id, lotrA.id);
    addImplication(lib, lotrA.id, fantasy.id);
    changeFileTags(lib, [file('a')], [lotrA.id], []);
    changeFileTags(lib, [file('b')], [frodo.id], []);

    const merged = mergeTags(lib, [lotrA.id], lotrB.id, true);
    expect(merged.aliases.sort()).toEqual(['lord of the rings', 'lotr']);
    expect(merged.impliedBy.map((t) => t.name)).toEqual(['frodo']);
    expect(merged.implies.map((t) => t.name)).toEqual(['fantasy']);
    expect(names(file('a'))).toEqual(['fantasy*', 'the lord of the rings']);
    expect(names(file('b'))).toEqual(['fantasy*', 'frodo', 'the lord of the rings*']);
    expect(() => tagDetail(lib, lotrA.id)).toThrow(/no longer exists/);
  });

  it('deleting a tag takes it off every image and re-derives implied tags', () => {
    const frodo = createTag(lib, { name: 'character:frodo' });
    const lotr = createTag(lib, { name: 'source:lotr' });
    addImplication(lib, frodo.id, lotr.id);
    changeFileTags(lib, [file('a')], [frodo.id], []);
    deleteTags(lib, [frodo.id]);
    expect(names(file('a'))).toEqual([]);
  });

  it('copies keep their tags unless told not to', async () => {
    const t = createTag(lib, { name: 'sketch' });
    changeFileTags(lib, [file('a')], [t.id], []);
    const other = folderByPath(lib, 'Fantasy/Other')!.id;
    const withTags = await copyFiles(lib, [file('a')], other);
    expect(names(withTags.ids[0]!)).toEqual(['sketch']);
    const without = await copyFiles(lib, [file('a')], other, 'keep-both', false);
    expect(names(without.ids[0]!)).toEqual([]);
  });
});

describe('search', () => {
  beforeEach(() => {
    const sunset = createTag(lib, { name: 'sunset' });
    const people = createTag(lib, { name: 'people' });
    const cat = createTag(lib, { name: 'cat' });
    const dog = createTag(lib, { name: 'dog' });
    const alice = createTag(lib, { name: 'character:alice' });
    createTag(lib, { name: 'artist:alice' });
    addAlias(lib, sunset.id, 'dusk');
    changeFileTags(lib, [file('a'), file('b'), file('c')], [sunset.id], []);
    changeFileTags(lib, [file('b')], [people.id], []);
    changeFileTags(lib, [file('a')], [cat.id], []);
    changeFileTags(lib, [file('c')], [dog.id, alice.id], []);
  });

  it.each([
    ['#sunset', ['a.png', 'b.png', 'c.png']],
    ['#dusk', ['a.png', 'b.png', 'c.png']],
    ['#sunset -#people', ['a.png', 'c.png']],
    ['~#cat ~#dog', ['a.png', 'c.png']],
    ['#sunset ~#cat ~#dog -#people', ['a.png', 'c.png']],
    ['character:alice', ['c.png']],
    ['#artist:alice', []],
    ['#alice', ['c.png']], // untyped: any type
    ['beach', ['beach map.png']],
    ['portraits -#sunset', ['d.png']], // words match folder names too
    ['#nothing_like_this', []],
  ])('%s', (q, expected) => {
    expect(query(q)).toEqual(expected);
  });

  it('reports unknown tags, scopes to a tag, and counts tags in the results', () => {
    expect(listFiles(lib, { sort: 'name', order: 'asc', q: '#sunset #unicorn' }).unknown).toEqual(['unicorn']);
    const sunset = suggestTags(lib, 'sunset')[0]!.id;
    expect(query('', { tag: sunset })).toEqual(['a.png', 'b.png', 'c.png']);

    const counts = tagCounts(lib, { sort: 'name', order: 'asc', q: '#sunset -#people' });
    expect(counts.map((c) => [c.name, c.count])).toEqual([['sunset', 2], ['alice', 1], ['cat', 1], ['dog', 1], ['people', 0]]);
  });
});
