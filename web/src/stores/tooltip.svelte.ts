import type { TagDetail, TagRef } from '@media-view/shared';
import { client, unwrap } from '../api.ts';

/**
 * The tag tooltip (design M2): type, name, the first paragraph of the wiki description, and counts.
 * Details are fetched on hover and cached briefly.
 */
export const tagTip = $state({
  tag: null as TagRef | null,
  detail: null as TagDetail | null,
  implied: false,
  x: 0,
  y: 0,
});

const cache = new Map<number, { at: number; detail: TagDetail }>();
const FRESH_MS = 30_000;
let timer: ReturnType<typeof setTimeout> | null = null;
/** The chip the tooltip belongs to. */
let anchor: HTMLElement | null = null;

export function showTagTip(tag: TagRef, el: HTMLElement, implied = false): void {
  if (timer) clearTimeout(timer);
  anchor = el;
  timer = setTimeout(async () => {
    // The chip may be gone by now (a click navigated, the list re-rendered): no tooltip then.
    if (anchor !== el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    Object.assign(tagTip, { tag, implied, x: r.left, y: r.bottom + 6, detail: null });
    const hit = cache.get(tag.id);
    if (hit && Date.now() - hit.at < FRESH_MS) tagTip.detail = hit.detail;
    else {
      try {
        const detail = await unwrap(client.api.tags[':id'].$get({ param: { id: String(tag.id) } }));
        cache.set(tag.id, { at: Date.now(), detail });
        if (tagTip.tag?.id === tag.id && anchor === el) tagTip.detail = detail;
      } catch {
        // no tooltip details
      }
    }
  }, 350);
}

export function hideTagTip(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  anchor = null;
  tagTip.tag = null;
}

/** Hide it if it belongs to this chip (the chip is going away). */
export function releaseTagTip(el: HTMLElement | undefined): void {
  if (el && anchor === el) hideTagTip();
}

// Clicking a chip navigates without a mouseleave; scrolling moves the chip from under a fixed tooltip.
window.addEventListener('hashchange', hideTagTip);
window.addEventListener('scroll', () => tagTip.tag && hideTagTip(), { capture: true, passive: true });
window.addEventListener('mousedown', hideTagTip, { capture: true });

/** The tooltip text: the description's first paragraph, without formatting, about 200 characters. */
export function firstParagraph(markdown: string | null): string {
  if (!markdown) return '';
  const para = markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#')) ?? '';
  const plain = para
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[(?:[^\]:]+:)?([^\]]+)\]\]/g, (_, n: string) => n.replace(/_/g, ' '))
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 200 ? `${plain.slice(0, 197).trimEnd()}…` : plain;
}
