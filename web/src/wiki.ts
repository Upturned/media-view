import type { TagRef } from '@media-view/shared';
import DOMPurify from 'dompurify';
import { Marked, type TokenizerAndRendererExtension } from 'marked';
import { client, unwrap } from './api.ts';

/**
 * Wiki pages are Markdown with tag links: `[[name]]`, `[[type:name]]`, `[[type:name|label]]`
 * (user guide §4.8). Links are resolved in one call per page; missing ones show dashed in amber.
 */

export interface WikiLink {
  /** What's resolved: `type:name` or `name`, as written. */
  ref: string;
  /** What's shown: the label, or the name with `_` as spaces. */
  text: string;
}

const LINK = /\[\[([^\]\n]+)\]\]/g;

export function parseLink(inner: string): WikiLink {
  const bar = inner.indexOf('|');
  const ref = (bar < 0 ? inner : inner.slice(0, bar)).trim();
  const label = bar < 0 ? '' : inner.slice(bar + 1).trim();
  const colon = ref.indexOf(':');
  const name = colon < 0 ? ref : ref.slice(colon + 1);
  return { ref, text: label || name.replace(/_/g, ' ').trim() };
}

export function wikiLinks(source: string): WikiLink[] {
  return [...source.matchAll(LINK)].map((m) => parseLink(m[1]!)).filter((l) => l.ref);
}

/** Resolved links, by ref; `null` = no such tag. Kept while the app runs; cleared when tags change. */
const resolved = new Map<string, TagRef | null>();

export function forgetLinks(): void {
  resolved.clear();
}

export function knownLink(ref: string, tag: TagRef | null): void {
  resolved.set(ref, tag);
}

/** Resolve the refs not resolved yet; returns all of them. */
export async function resolveLinks(refs: string[]): Promise<Map<string, TagRef | null>> {
  const unknown = [...new Set(refs)].filter((r) => !resolved.has(r) && !r.includes(','));
  if (unknown.length) {
    const r = await unwrap(client.api.tags.resolve.$get({ query: { names: unknown.join(',') } }));
    for (const ref of unknown) resolved.set(ref, r.tags[ref] ?? null);
  }
  return new Map(refs.map((r) => [r, resolved.get(r) ?? null]));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Render a page. Links carry `data-ref`; resolved ones link to the tag's wiki page and carry its
 * type color, missing ones (or not yet resolved) are marked `missing`.
 */
export function renderWiki(source: string, links: Map<string, TagRef | null>, color: (typeId: number) => string): string {
  const ext: TokenizerAndRendererExtension = {
    name: 'wikilink',
    level: 'inline',
    start: (src) => src.indexOf('[['),
    tokenizer(src) {
      const m = /^\[\[([^\]\n]+)\]\]/.exec(src);
      if (!m) return undefined;
      return { type: 'wikilink', raw: m[0], link: parseLink(m[1]!) };
    },
    renderer(token) {
      const link = token['link'] as WikiLink;
      const tag = links.get(link.ref);
      if (tag) {
        return `<a class="wl" href="#/tags/${tag.id}" data-ref="${esc(link.ref)}" style="--lc:${esc(color(tag.typeId))}">${esc(link.text)}</a>`;
      }
      return `<a class="wl missing" href="#" data-ref="${esc(link.ref)}" title="No such tag yet — click to create it">${esc(link.text)}<sup>missing</sup></a>`;
    },
  };
  const md = new Marked({ extensions: [ext], gfm: true, breaks: false });
  return DOMPurify.sanitize(md.parse(source, { async: false }));
}

/** The name and type to create a missing link as. */
export function missingTarget(ref: string, typeKeys: string[]): { name: string; typeKey: string | null } {
  const colon = ref.indexOf(':');
  if (colon > 0) {
    const key = ref.slice(0, colon).trim().toLowerCase();
    if (typeKeys.includes(key)) return { name: ref.slice(colon + 1).replace(/_/g, ' ').trim(), typeKey: key };
  }
  return { name: ref.replace(/_/g, ' ').trim(), typeKey: null };
}
