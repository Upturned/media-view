/**
 * Tag name rules (technical doc §10.1). Names are shown with spaces as typed; space and `_` are the
 * same character for matching, so `red dress`, `red_dress` and `Red Dress` are one tag.
 */

/** Characters that mean something in the search syntax (`#`, `:`, `,`) or in wiki links (`[`, `]`). */
const FORBIDDEN = /[#:,[\]]/;

/** How a name is shown and stored: trimmed, `_` as spaces, inner whitespace collapsed. */
export function displayTagName(raw: string): string {
  return raw.normalize('NFC').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The key names are compared by. */
export function normTagName(raw: string): string {
  return displayTagName(raw).toLowerCase();
}

/** How a name is written in the search box: spaces as `_`. */
export function searchTagName(name: string): string {
  return displayTagName(name).replace(/ /g, '_');
}

/** Why a tag name isn't valid, or '' if it is. */
export function tagNameProblem(raw: string): string {
  const name = displayTagName(raw);
  if (!name) return 'A name is required.';
  if (name.length > 100) return 'The name is too long.';
  if (FORBIDDEN.test(name)) return 'Tag names can’t contain  # : , [ ]';
  if (/^[-~]/.test(name)) return 'Tag names can’t start with - or ~.';
  return '';
}

/**
 * Collection names (technical doc §6.6) follow the same matching rules as tag names (case, and space
 * vs. `_`, don't count), but may hold any punctuation: in a search, `@"Court outfits — final pass"`.
 */
export function collectionNameProblem(raw: string): string {
  const name = displayTagName(raw);
  if (!name) return 'A name is required.';
  if (name.length > 100) return 'The name is too long.';
  if (name.includes('"')) return 'Collection names can’t contain "';
  return '';
}

/** A tag type's key, used as `key:name` in searches: lowercase, `_` for spaces. */
export function typeKeyOf(name: string): string {
  return displayTagName(name).toLowerCase().replace(/ /g, '_').replace(/[^\p{L}\p{N}_-]/gu, '') || 'type';
}
