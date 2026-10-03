import { displayTagName, normTagName, searchTagName } from './tag-names.ts';

/**
 * The search syntax (technical doc §11.1), used by the server to build queries and by the client to
 * highlight the search box and to keep the tag sidebar and the query in sync.
 *
 *   query   := term (WS term)*
 *   term    := ['-' | '~'] ( tagterm | text )   -- '-' never, '~' member of the "any of" group
 *   tagterm := '#' [typekey ':'] name           -- explicit tag
 *            | typekey ':' name                 -- shorthand, only for a known tag type
 *   text    := any other word or "quoted phrase"
 *
 * In a tag term, spaces in names are written as `_` (`#red_dress`).
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

export interface TextTerm {
  kind: 'text';
  op: 'must' | 'never';
  value: string;
  start: number;
  end: number;
}

export type Term = TagTerm | TextTerm;

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
    // '~' only means something on tags: on a word it's ignored.
    if (word) terms.push({ kind: 'text', op: op === 'never' ? 'never' : 'must', value: word, start, end });
  }
  return terms;
}

/** The search-box token for a tag: `#character:aerin_valecrest`, `-#sketch`, `~#cat`. */
export function tagToken(op: TagOp, typeKey: string | null, name: string): string {
  const prefix = op === 'never' ? '-' : op === 'any' ? '~' : '';
  return `${prefix}#${typeKey ? `${typeKey}:` : ''}${searchTagName(name)}`;
}

function sameTag(term: TagTerm, tag: { typeKey: string; name: string }): boolean {
  return normTagName(term.name) === normTagName(tag.name) && (term.type === null || term.type === tag.typeKey.toLowerCase());
}

/** How a tag is used in a query (for the sidebar's include / exclude / any-of marks). */
export function tagStateIn(query: string, typeKeys: Iterable<string>, tag: { typeKey: string; name: string }): TagOp | null {
  const term = parseQuery(query, typeKeys).find((t): t is TagTerm => t.kind === 'tag' && sameTag(t, tag));
  return term?.op ?? null;
}

/** The query with a tag set to `state` (or removed with null); every other term is kept as typed. */
export function setTagState(query: string, typeKeys: Iterable<string>, tag: { typeKey: string; name: string }, state: TagOp | null): string {
  const terms = parseQuery(query, typeKeys);
  let out = query;
  // Remove from the end so earlier offsets stay valid.
  for (const t of [...terms].reverse()) {
    if (t.kind === 'tag' && sameTag(t, tag)) out = out.slice(0, t.start) + out.slice(t.end);
  }
  out = out.replace(/\s+/g, ' ').trim();
  if (state) out = `${out} ${tagToken(state, tag.typeKey, tag.name)}`.trim();
  return out;
}

/** The plain-text words of a query (what folders and tags are matched by on the Search page). */
export function textOf(query: string, typeKeys: Iterable<string>): string {
  return parseQuery(query, typeKeys)
    .filter((t): t is TextTerm => t.kind === 'text' && t.op === 'must')
    .map((t) => t.value)
    .join(' ');
}
