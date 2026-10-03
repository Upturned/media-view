import { describe, expect, it } from 'vitest';
import { parseQuery, setTagState, tagStateIn, tagToken, textOf } from '../src/search-syntax.ts';
import { displayTagName, normTagName, tagNameProblem, typeKeyOf } from '../src/tag-names.ts';

const TYPES = ['general', 'character', 'source', 'artist'];
const strip = (q: string) => parseQuery(q, TYPES).map(({ start: _s, end: _e, ...t }) => t);

describe('tag names', () => {
  it('treats spaces and underscores alike, shows spaces', () => {
    expect(displayTagName('  red_dress   long ')).toBe('red dress long');
    expect(normTagName('Red_Dress')).toBe(normTagName('red dress'));
    expect(tagNameProblem('a:b')).not.toBe('');
    expect(tagNameProblem('-x')).not.toBe('');
    expect(tagNameProblem('[[x]]')).not.toBe('');
    expect(tagNameProblem('nimue (winter form)')).toBe('');
    expect(typeKeyOf('Body Parts!')).toBe('body_parts');
  });
});

describe('search syntax (table-driven, user guide §5.6)', () => {
  it.each([
    ['beach', [{ kind: 'text', op: 'must', value: 'beach' }]],
    ['#sunset', [{ kind: 'tag', op: 'must', type: null, name: 'sunset' }]],
    ['#sunset -#people', [{ kind: 'tag', op: 'must', type: null, name: 'sunset' }, { kind: 'tag', op: 'never', type: null, name: 'people' }]],
    ['~#cat ~#dog', [{ kind: 'tag', op: 'any', type: null, name: 'cat' }, { kind: 'tag', op: 'any', type: null, name: 'dog' }]],
    ['#character:alice', [{ kind: 'tag', op: 'must', type: 'character', name: 'alice' }]],
    ['character:alice', [{ kind: 'tag', op: 'must', type: 'character', name: 'alice' }]],
    ['-artist:bob', [{ kind: 'tag', op: 'never', type: 'artist', name: 'bob' }]],
    ['#red_dress', [{ kind: 'tag', op: 'must', type: null, name: 'red dress' }]],
    ['beach #sunset', [{ kind: 'text', op: 'must', value: 'beach' }, { kind: 'tag', op: 'must', type: null, name: 'sunset' }]],
    ['"beach trip" -wip', [{ kind: 'text', op: 'must', value: 'beach trip' }, { kind: 'text', op: 'never', value: 'wip' }]],
    // An unknown type prefix without # is just text (e.g. a time like 10:30).
    ['10:30', [{ kind: 'text', op: 'must', value: '10:30' }]],
    // Still typing: an empty tag name.
    ['character:', [{ kind: 'tag', op: 'must', type: 'character', name: '' }]],
  ])('%s', (q, expected) => {
    expect(strip(q)).toEqual(expected);
  });

  it('round-trips sidebar states into the query', () => {
    const tag = { typeKey: 'general', name: 'red dress' };
    let q = 'beach';
    q = setTagState(q, TYPES, tag, 'must');
    expect(q).toBe('beach #general:red_dress');
    expect(tagStateIn(q, TYPES, tag)).toBe('must');
    q = setTagState(q, TYPES, tag, 'never');
    expect(q).toBe('beach -#general:red_dress');
    // An untyped term counts as the same tag.
    expect(tagStateIn('~#red_dress', TYPES, tag)).toBe('any');
    expect(setTagState('#red_dress beach', TYPES, tag, null)).toBe('beach');
    expect(tagToken('any', null, 'nimue (winter form)')).toBe('~#nimue_(winter_form)');
    expect(textOf('beach #x -wip "old town"', TYPES)).toBe('beach old town');
  });
});
