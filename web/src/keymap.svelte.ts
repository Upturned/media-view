import { untrack } from 'svelte';

/**
 * Keymap registry (technical doc §13.5): every shortcut is registered here, and the same
 * registry dispatches key events and feeds the Help dialog's Shortcuts tab.
 */

export interface Binding {
  /** e.g. 'F1', '?', 'Ctrl+K', 'ArrowLeft' */
  key: string;
  description: string;
  /** 'global' or the page that registered it */
  scope: string;
  handler: (e: KeyboardEvent) => void;
  /** Also fire while typing in an input. */
  inInputs?: boolean;
}

export const keymap = $state({ bindings: [] as Binding[] });

/** Register shortcuts; returns the unregister function (return it from an `$effect`). */
export function registerKeys(scope: string, list: Omit<Binding, 'scope'>[]): () => void {
  const added: Binding[] = list.map((b) => ({ ...b, scope }));
  // untrack: called from $effect, and reading the list there would make the effect depend on what it writes.
  untrack(() => keymap.bindings.push(...added));
  return () => untrack(() => {
    // Compare fields: items stored in $state are proxies, not the objects we pushed.
    keymap.bindings = keymap.bindings.filter((b) => !added.some((a) => a.key === b.key && a.scope === b.scope && a.description === b.description));
  });
}

function eventKey(e: KeyboardEvent): string {
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && e.key.length > 1 && 'Shift'].filter(Boolean);
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [...mods, key].join('+');
}

function normalize(key: string): string {
  const parts = key.split('+');
  const last = parts.pop()!;
  return [...parts, last.length === 1 ? last.toUpperCase() : last].join('+');
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  const pressed = eventKey(e);
  const typing = isTyping(e.target);
  // Latest registration wins, so a page can override a global key.
  for (let i = keymap.bindings.length - 1; i >= 0; i--) {
    const b = keymap.bindings[i]!;
    if (normalize(b.key) !== pressed || (typing && !b.inInputs)) continue;
    e.preventDefault();
    b.handler(e);
    return;
  }
});
