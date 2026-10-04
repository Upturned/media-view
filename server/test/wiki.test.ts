import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addField, changeKind, deleteField, kindCosts, listFields, setValues, typeChangeLoss, updateField, valuesOf,
} from '../src/services/fields.ts';
import { closeLibrary, createLibrary, type OpenLibrary } from '../src/services/library.ts';
import { reconcile } from '../src/services/reconcile.ts';
import {
  addAlias, changeFileTags, createTag, listTypes, mergeTags, relatedTags, resolveNames, savePage, updateTag, wikiPage,
} from '../src/services/tags.ts';
import { fileByPath, tempDir, tree } from './helpers.ts';

let lib: OpenLibrary;

beforeEach(async () => {
  lib = createLibrary(path.join(tempDir(), 'Lib'));
  const t = tree(lib);
  for (const n of ['a', 'b', 'c', 'd', 'e']) t.file(`Fantasy/Portraits/${n}.png`, n);
  await reconcile(lib);
});

afterEach(() => closeLibrary());

const type = (key: string) => listTypes(lib).find((t) => t.key === key)!.id;
const field = (typeKey: string, key: string) => listFields(lib, type(typeKey)).find((f) => f.key === key)!;
const file = (n: string) => fileByPath(lib, `Fantasy/Portraits/${n}.png`)!.id;
const value = (tagId: number, fieldId: number) => valuesOf(lib, tagId).find((v) => v.fieldId === fieldId);

describe('custom fields', () => {
  it('comes with the default fields; tag references allow types by id', () => {
    expect(listFields(lib, type('character')).map((f) => [f.key, f.kind])).toEqual([
      ['full_name', 'text'], ['species', 'text'], ['age', 'number'], ['related_characters', 'tagref'],
    ]);
    expect(field('character', 'related_characters').options).toEqual({ types: [type('character')], multi: true });
    expect(field('source', 'kind').options.choices).toContain('book');
  });

  it('validates values by kind and stores them', () => {
    const aerin = createTag(lib, { name: 'character:aerin' });
    const lathir = createTag(lib, { name: 'character:lathir' });
    const lotr = createTag(lib, { name: 'source:lotr' });
    const age = field('character', 'age');
    const rel = field('character', 'related_characters');

    expect(() => setValues(lib, aerin.id, aerin.typeId, { [age.id]: { value: 'old' } })).toThrow(/isn’t a number/);
    expect(() => setValues(lib, aerin.id, aerin.typeId, { [rel.id]: { tagIds: [lotr.id] } })).toThrow(/only takes some types/);
    expect(() => setValues(lib, aerin.id, aerin.typeId, { [rel.id]: { tagIds: [aerin.id] } })).toThrow(/itself/);

    setValues(lib, aerin.id, aerin.typeId, { [age.id]: { value: '212,5' }, [rel.id]: { tagIds: [lathir.id] } });
    expect(value(aerin.id, age.id)?.value).toBe('212.5');
    expect(value(aerin.id, rel.id)?.tags.map((t) => t.name)).toEqual(['lathir']);

    const release = field('source', 'release_date');
    expect(() => setValues(lib, lotr.id, lotr.typeId, { [release.id]: { value: '1954-02-30' } })).toThrow(/isn’t a date/);
    expect(() => setValues(lib, lotr.id, lotr.typeId, { [release.id]: { value: '1954-13' } })).toThrow(/isn’t a date/);
    setValues(lib, lotr.id, lotr.typeId, { [release.id]: { value: '1954-07' } });
    expect(value(lotr.id, release.id)?.value).toBe('1954-07');
    const web = addField(lib, type('source'), { label: 'Website', kind: 'link' });
    expect(() => setValues(lib, lotr.id, lotr.typeId, { [web.id]: { value: 'example.com' } })).toThrow(/http/);

    // Empty clears.
    setValues(lib, aerin.id, aerin.typeId, { [age.id]: { value: '' } });
    expect(value(aerin.id, age.id)).toBeUndefined();
  });

  it('tells what a kind change would lose, refuses it, or clears the lost values', () => {
    const t = createTag(lib, { name: 'character:a' });
    const u = createTag(lib, { name: 'character:b' });
    const species = field('character', 'species');
    setValues(lib, t.id, t.typeId, { [species.id]: { value: '12' } });
    setValues(lib, u.id, u.typeId, { [species.id]: { value: 'elf' } });

    expect(kindCosts(lib, species.id)).toMatchObject({ text: 0, longtext: 0, number: 1, choice: 0, image: 2, tagref: 2 });
    expect(() => changeKind(lib, species.id, 'number')).toThrow(/1 value can’t convert/);

    // To choice: the existing values become the choices.
    expect(changeKind(lib, species.id, 'choice').options.choices).toEqual(['12', 'elf']);
    changeKind(lib, species.id, 'number', true);
    expect(value(t.id, species.id)?.value).toBe('12');
    expect(value(u.id, species.id)).toBeUndefined();
  });

  it('settings changes drop values that no longer fit; deleting a field drops its values', () => {
    const src = createTag(lib, { name: 'source:x' });
    const kind = field('source', 'kind');
    setValues(lib, src.id, src.typeId, { [kind.id]: { value: 'GAME' } });
    expect(value(src.id, kind.id)?.value).toBe('game');
    updateField(lib, kind.id, { options: { choices: ['book', 'film'] } });
    expect(value(src.id, kind.id)).toBeUndefined();
    deleteField(lib, kind.id);
    expect(listFields(lib, type('source')).map((f) => f.key)).not.toContain('kind');
  });
});

describe('type changes and merges keep field values where they fit', () => {
  it('keeps values whose field key exists on the new type, and lists the rest first', () => {
    const t = createTag(lib, { name: 'character:x' });
    const full = field('character', 'full_name');
    const age = field('character', 'age');
    addField(lib, type('artist'), { label: 'Full name', kind: 'text' });
    setValues(lib, t.id, t.typeId, { [full.id]: { value: 'Xavier' }, [age.id]: { value: '30' } });

    expect(typeChangeLoss(lib, t.id, type('character'), type('artist'))).toEqual([{ fieldId: age.id, label: 'Age', value: '30' }]);
    updateTag(lib, t.id, { typeId: type('artist') });
    const page = wikiPage(lib, t.id);
    expect(page.values.map((v) => [page.fields.find((f) => f.id === v.fieldId)?.key, v.value])).toEqual([['full_name', 'Xavier']]);
  });

  it('merge fills the target’s empty fields and repoints references', () => {
    const a = createTag(lib, { name: 'character:aerin' });
    const b = createTag(lib, { name: 'character:aerin valecrest' });
    const c = createTag(lib, { name: 'character:lathir' });
    const full = field('character', 'full_name');
    const species = field('character', 'species');
    const rel = field('character', 'related_characters');
    setValues(lib, a.id, a.typeId, { [full.id]: { value: 'from a' }, [species.id]: { value: 'elf' } });
    setValues(lib, b.id, b.typeId, { [full.id]: { value: 'from b' } });
    setValues(lib, c.id, c.typeId, { [rel.id]: { tagIds: [a.id] } });

    mergeTags(lib, [a.id], b.id);
    expect(value(b.id, full.id)?.value).toBe('from b');
    expect(value(b.id, species.id)?.value).toBe('elf');
    expect(value(c.id, rel.id)?.tags.map((t) => t.id)).toEqual([b.id]);
  });
});

describe('the wiki page', () => {
  it('saves description, cover and fields together — or nothing', () => {
    const t = createTag(lib, { name: 'character:aerin' });
    const age = field('character', 'age');
    changeFileTags(lib, [file('a')], [t.id], []);
    expect(() => savePage(lib, t.id, { description: 'new', fields: { [age.id]: { value: 'old' } } })).toThrow();
    expect(wikiPage(lib, t.id).description).toBeNull();

    const page = savePage(lib, t.id, { description: '# Aerin\n\nHeir of [[source:lotr]].', coverFileId: file('a'), fields: { [age.id]: { value: '212' } } });
    expect(page).toMatchObject({ description: '# Aerin\n\nHeir of [[source:lotr]].', cover: { id: file('a') } });
    expect(page.preview.map((p) => p.id)).toEqual([file('a')]);
    expect(() => savePage(lib, t.id, { description: 'x'.repeat(20_001) })).toThrow(/20,000/);
  });

  it('ranks related tags by how often they appear together', () => {
    const [aerin, lathir, armor, sketch] = ['character:aerin', 'character:lathir', 'armor', 'sketch'].map((n) => createTag(lib, { name: n }));
    const all = ['a', 'b', 'c', 'd', 'e'].map(file);
    changeFileTags(lib, all.slice(0, 4), [aerin!.id], []);
    changeFileTags(lib, all.slice(0, 3), [lathir!.id], []);
    changeFileTags(lib, [all[0]!], [armor!.id], []);
    changeFileTags(lib, all, [sketch!.id], []);
    const related = relatedTags(lib, aerin!.id);
    expect(related.map((r) => [r.name, r.together, r.pct])).toEqual([['sketch', 4, 100], ['lathir', 3, 75], ['armor', 1, 25]]);
  });

  it('resolves wiki links by name, type and alias', () => {
    const lotr = createTag(lib, { name: 'source:the lord of the rings' });
    addAlias(lib, lotr.id, 'lotr');
    expect(resolveNames(lib, ['source:lotr', 'the_lord_of_the_rings', 'character:lotr', 'nothing'])).toEqual({
      'source:lotr': { id: lotr.id, typeId: lotr.typeId, name: 'the lord of the rings' },
      the_lord_of_the_rings: { id: lotr.id, typeId: lotr.typeId, name: 'the lord of the rings' },
      'character:lotr': null,
      nothing: null,
    });
  });
});
