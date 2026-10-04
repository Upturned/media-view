import { displayTagName, normTagName, searchTagName } from './tag-names.ts';

/**
 * The search syntax (technical doc §11.1), used by the server to build queries and by the client to
 * highlight the search box and to keep the index (tags and collections) and the query in sync.
 *
 *   query    := term (WS term)*
 *   term     := ['-' | '~'] ( tagterm | collterm | text )   -- '-' never, '~' member of the "any of" group
 *   tagterm  := '#' [typekey ':'] name           -- explicit tag
 *             | typekey ':' name                 -- shorthand, only for a known tag type
 *   collterm := '@' name | '@"' any name '"'     -- images in a collection (milestone 6)
 *   text     := any other word or "quoted phrase"
 *
 * In tag and collection terms, spaces in names are written as `_` (`#red_dress`, `@chapter_3`).
 * "Any of" is one group for tags and collections together: `~#cat ~@wallpapers`.
 */

export type TagOp = 'must' | 'never' | 'any';

export interface TagTerm {
  kind: 'tag';
  op: TagOp;
  /** The type key, or null when untyped. */
  type: string | null;
  /** Display name (underscores as spaces); '' while still being typed (`#`, `character:`). */
  name: string;
  start: number;
  end: number;
}

export interface CollectionTerm {
  kind: 'collection';
  op: TagOp;
  /** Display name; '' while still being typed (`@`). */
  name: string;
  start: number;
  end: number;
}

export interface TextTerm {
  kind: 'text';
  op: 'must' | 'never';
  value: string;
  start: number;
  end: number;
}

export type Term = TagTerm | CollectionTerm | TextTerm;

const SHORTHAND = /^([\p{L}\p{N}_-]+):(.*)$/u;

export function parseQuery(query: string, typeKeys: Iterable<string>): Term[] {
  const keys = new Set([...typeKeys].map((k) => k.toLowerCase()));
  const terms: Term[] = [];
  let i = 0;
  while (i < query.length) {
    if (/\s/.test(query[i]!)) {
      i++;
      continue;
    }
    const start = i;
    let op: TagOp = 'must';
    if (query[i] === '-' || query[i] === '~') {
      op = query[i] === '-' ? 'never' : 'any';
      i++;
    }
    // @"quoted collection name"
    if (query.startsWith('@"', i)) {
      const close = query.indexOf('"', i + 2);
      const end = close < 0 ? query.length : close + 1;
      const name = query.slice(i + 2, close < 0 ? query.length : close).replace(/\s+/g, ' ').trim();
      terms.push({ kind: 'collection', op, name, start, end });
      i = end;
      continue;
    }
    // "quoted phrase": always text
    if (query[i] === '"') {
      const close = query.indexOf('"', i + 1);
      const end = close < 0 ? query.length : close + 1;
      const value = query.slice(i + 1, close < 0 ? query.length : close).trim();
      if (value) terms.push({ kind: 'text', op: op === 'never' ? 'never' : 'must', value, start, end });
      i = end;
      continue;
    }
    let end = i;
    while (end < query.length && !/\s/.test(query[end]!)) end++;
    const word = query.slice(i, end);
    i = end;

    if (word.startsWith('@')) {
      terms.push({ kind: 'collection', op, name: displayTagName(word.slice(1)), start, end });
      continue;
    }
    if (word.startsWith('#')) {
      const body = word.slice(1);
      const m = SHORTHAND.exec(body);
      terms.push(m
        ? { kind: 'tag', op, type: m[1]!.toLowerCase(), name: displayTagName(m[2]!), start, end }
        : { kind: 'tag', op, type: null, name: displayTagName(body), start, end });
      continue;
    }
    const m = SHORTHAND.exec(word);
    if (m && keys.has(m[1]!.toLowerCase())) {
      terms.push({ kind: 'tag', op, type: m[1]!.toLowerCase(), name: displayTagName(m[2]!), start, end });
      continue;
    }
    // '~' only means something on tags and collections: on a word it's ignored.
    if (word) terms.push({ kind: 'text', op: op === 'never' ? 'never' : 'must', value: word, start, end });
  }
  return terms;
}

const opPrefix = (op: TagOp) => (op === 'never' ? '-' : op === 'any' ? '~' : '');

/** The search-box token for a tag: `#character:aerin_valecrest`, `-#sketch`, `~#cat`. */
export function tagToken(op: TagOp, typeKey: string | null, name: string): string {
  return `${opPrefix(op)}#${typeKey ? `${typeKey}:` : ''}${searchTagName(name)}`;
}

/** The search-box token for a collection: `@chapter_3`, or quoted when the name has punctuation: `@"Court outfits — final pass"`. */
export function collectionToken(op: TagOp, name: string): string {
  const plain = /^[\p{L}\p{N} ]+$/u.test(name);
  return `${opPrefix(op)}@${plain ? searchTagName(name) : `"${name}"`}`;
}

/** What the index switches on and off: a tag (with its type key) or a collection. */
export type IndexEntry = { kind: 'tag'; typeKey: string; name: string } | { kind: 'collection'; name: string };

function sameEntry(term: Term, entry: IndexEntry): boolean {
  if (term.kind === 'text' || term.kind !== entry.kind || normTagName(term.name) !== normTagName(entry.name)) return false;
  return term.kind === 'collection' || entry.kind === 'collection' || term.type === null || term.type === entry.typeKey.toLowerCase();
}

const tokenOf = (op: TagOp, entry: IndexEntry) => (entry.kind === 'tag' ? tagToken(op, entry.typeKey, entry.name) : collectionToken(op, entry.name));

/** How a tag or collection is used in a query (for the index's must / never / any-of marks). */
export function entryStateIn(query: string, typeKeys: Iterable<string>, entry: IndexEntry): TagOp | null {
  const term = parseQuery(query, typeKeys).find((t) => sameEntry(t, entry));
  return term && term.kind !== 'text' ? term.op : null;
}

/** The query with a tag or collection set to `state` (or removed with null); every other term is kept as typed. */
export function setEntryState(query: string, typeKeys: Iterable<string>, entry: IndexEntry, state: TagOp | null): string {
  const terms = parseQuery(query, typeKeys);
  let out = query;
  // Remove from the end so earlier offsets stay valid.
  for (const t of [...terms].reverse()) {
    if (sameEntry(t, entry)) out = out.slice(0, t.start) + out.slice(t.end);
  }
  out = out.replace(/\s+/g, ' ').trim();
  if (state) out = `${out} ${tokenOf(state, entry)}`.trim();
  return out;
}

/** How a tag is used in a query (for the index's must / never / any-of marks). */
export function tagStateIn(query: string, typeKeys: Iterable<string>, tag: { typeKey: string; name: string }): TagOp | null {
  return entryStateIn(query, typeKeys, { kind: 'tag', ...tag });
}

/** The query with a tag set to `state` (or removed with null); every other term is kept as typed. */
export function setTagState(query: string, typeKeys: Iterable<string>, tag: { typeKey: string; name: string }, state: TagOp | null): string {
  return setEntryState(query, typeKeys, { kind: 'tag', ...tag }, state);
}

/** The plain-text words of a query (what folders, tags and collections are matched by on the Search page). */
export function textOf(query: string, typeKeys: Iterable<string>): string {
  return parseQuery(query, typeKeys)
    .filter((t): t is TextTerm => t.kind === 'text' && t.op === 'must')
    .map((t) => t.value)
    .join(' ');
}
