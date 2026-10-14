import { registerKeys } from './keymap.svelte.ts';

/**
 * Keyboard or mouse (design M8 · 1.0): the focus ring is a keyboard cursor. It shows after a
 * navigation key and hides as soon as the pointer moves onto another element — never on clicks.
 * `<html data-input="kbd|mouse">` drives the CSS (base.css); pages read `input.kbd` too.
 */

export const input = $state({ kbd: false });

const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Tab']);

/** Where the pointer was when a key last took over: it must leave that element to hide the ring. */
let pointerTarget: Element | null = null;
let keyTarget: Element | null = null;
let lastX = -1;
let lastY = -1;

export function setKeyboard(on: boolean): void {
  if (on) keyTarget = pointerTarget;
  if (input.kbd === on) return;
  input.kbd = on;
  document.documentElement.dataset.input = on ? 'kbd' : 'mouse';
}

document.documentElement.dataset.input = 'mouse';
window.addEventListener('keydown', (e) => {
  if (NAV_KEYS.has(e.key)) setKeyboard(true);
}, true);
window.addEventListener('pointermove', (e) => {
  // Scrolling under a still pointer sends moves at the same spot: those don't count.
  if (e.clientX === lastX && e.clientY === lastY) return;
  lastX = e.clientX;
  lastY = e.clientY;
  pointerTarget = e.target as Element;
  if (input.kbd && pointerTarget !== keyTarget) setKeyboard(false);
}, true);
window.addEventListener('pointerdown', () => setKeyboard(false), true);

// ─── Remembered places (Explorer: the next key moves from where you were) ────

const remembered = new Map<string, number>();

/** The item last focused, clicked or opened in a list (keyed by the list), e.g. a file id. */
export const rememberFocus = (key: string, value: number) => void remembered.set(key, value);
export const rememberedFocus = (key: string) => remembered.get(key);

// ─── The keyboard hint (design M8 · 1J): once per browser and kind of page, the first time a key moves the cursor ───

export type HintContext = 'grid' | 'cards' | 'strip';
export const keyHint = $state({ context: null as HintContext | null });
let hintTimer: ReturnType<typeof setTimeout> | undefined;

export function showKeyHint(context: HintContext): void {
  try {
    if (localStorage.getItem(`kbd.hinted.${context}`)) return;
    localStorage.setItem(`kbd.hinted.${context}`, '1');
  } catch {
    return;
  }
  keyHint.context = context;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (keyHint.context = null), 5000);
}

// It leaves on the next pointer move too.
window.addEventListener('pointermove', () => {
  if (keyHint.context && !input.kbd) keyHint.context = null;
});

// ─── Card pages and lists (design M8 · 1C, 1D) ───────────────────────────────

interface NavOptions {
  /** 'cards': arrows by position on screen; 'rows': ↑ ↓ only. */
  kind: 'cards' | 'rows';
  /** The ring inside the item (lists scroll and clip); always for rows. */
  inset?: boolean;
}

/**
 * `use:navItems` on a page's container: its `[data-nav]` elements become a keyboard list. Enter
 * clicks the item's `[data-nav-open]` (else the item itself if it's a link, else its first link or
 * button), Space its `[data-nav-select]`, Delete its `[data-nav-delete]`. The place is remembered
 * per page, so coming back lands where you were.
 */
export function navItems(node: HTMLElement, opts: NavOptions) {
  const key = `nav:${location.hash}`;
  let index: number | null = rememberedFocus(key) ?? null;
  const items = () => [...node.querySelectorAll<HTMLElement>('[data-nav]')];

  function paint() {
    const list = items();
    list.forEach((el, i) => {
      el.classList.toggle('is-focused', i === index);
      el.classList.toggle('kb-row', opts.kind === 'rows' || !!opts.inset);
    });
  }

  function go(to: (list: HTMLElement[], from: number) => number) {
    const list = items();
    if (list.length === 0) return;
    const next = index === null || index >= list.length ? 0 : Math.max(0, Math.min(list.length - 1, to(list, index)));
    index = next;
    rememberFocus(key, next);
    paint();
    list[next]!.scrollIntoView({ block: 'nearest' });
    showKeyHint('cards');
  }

  /** The item in the next row up or down, nearest in x (cards wrap into rows). */
  function vertical(list: HTMLElement[], from: number, dir: 1 | -1): number {
    if (opts.kind === 'rows') return from + dir;
    const r = list.map((el) => el.getBoundingClientRect());
    const here = r[from]!;
    const cx = here.left + here.width / 2;
    const rowTops = r.map((b) => b.top).filter((t) => (dir > 0 ? t > here.top + 2 : t < here.top - 2));
    if (rowTops.length === 0) return from;
    const top = dir > 0 ? Math.min(...rowTops) : Math.max(...rowTops);
    let best = from;
    let dist = Infinity;
    r.forEach((b, i) => {
      if (Math.abs(b.top - top) > 2) return;
      const d = Math.abs(b.left + b.width / 2 - cx);
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  }

  const current = () => (index === null ? undefined : items()[index]);
  const unregister = registerKeys(opts.kind, [
    { key: 'ArrowDown', description: 'Next', handler: () => go((l, i) => vertical(l, i, 1)) },
    { key: 'ArrowUp', description: 'Previous', handler: () => go((l, i) => vertical(l, i, -1)) },
    ...(opts.kind === 'cards' ? [
      { key: 'ArrowRight', description: 'Next', handler: () => go((_, i) => i + 1) },
      { key: 'ArrowLeft', description: 'Previous', handler: () => go((_, i) => i - 1) },
    ] : []),
    { key: 'Home', description: 'First', handler: () => go(() => 0) },
    { key: 'End', description: 'Last', handler: () => go((l) => l.length - 1) },
    {
      key: 'Enter',
      description: 'Open',
      handler: () => {
        const el = current();
        if (!el) return go(() => 0);
        const target = el.querySelector<HTMLElement>('[data-nav-open]')
          ?? (el.matches('a[href], button') ? el : el.querySelector<HTMLElement>('a[href]') ?? el.querySelector<HTMLElement>('button'));
        target?.click();
      },
    },
    { key: ' ', description: 'Select', handler: () => current()?.querySelector<HTMLElement>('[data-nav-select]')?.click() },
    { key: 'Delete', description: 'Delete', handler: () => current()?.querySelector<HTMLElement>('[data-nav-delete]')?.click() },
  ]);

  // A click remembers the item (no ring); a re-render keeps the mark on the right element.
  const onPointer = (e: PointerEvent) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-nav]');
    const i = el ? items().indexOf(el) : -1;
    if (i >= 0) { index = i; rememberFocus(key, i); paint(); }
  };
  node.addEventListener('pointerdown', onPointer);
  const observer = new MutationObserver(() => {
    const el = current();
    if (el && !el.classList.contains('is-focused')) paint();
  });
  observer.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  paint();

  return {
    destroy() {
      unregister();
      observer.disconnect();
      node.removeEventListener('pointerdown', onPointer);
    },
  };
}

/**
 * `use:segmented` on a row of buttons (design M8 · 1F): one Tab stop — the chosen button, marked
 * `.on` — with ← → moving between them; Space / Enter picks (the button's own click).
 */
export function segmented(node: HTMLElement) {
  const buttons = () => [...node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  function stops() {
    const list = buttons();
    const chosen = list.find((b) => b.classList.contains('on')) ?? list[0];
    for (const b of list) b.tabIndex = b === chosen || b === document.activeElement ? 0 : -1;
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const list = buttons();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault(); // not the page's own arrow keys
    const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1)))]!;
    next.tabIndex = 0;
    next.focus();
    list[i]!.tabIndex = -1;
  };
  node.addEventListener('keydown', onKey);
  node.addEventListener('focusout', () => queueMicrotask(stops));
  const observer = new MutationObserver(stops);
  observer.observe(node, { subtree: true, attributes: true, attributeFilter: ['class', 'disabled'], childList: true });
  stops();
  return {
    destroy() {
      observer.disconnect();
      node.removeEventListener('keydown', onKey);
    },
  };
}
