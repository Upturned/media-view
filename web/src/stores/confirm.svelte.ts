/** Confirmations (design M3 · 05): one frame, three weights. `ask()` resolves true when confirmed. */

export interface ConfirmItem {
  name: string;
  note: string;
  /** Starred items that stay are shown dimmed with a yellow dot. */
  kept?: boolean;
}

export interface ConfirmRequest {
  title: string;
  sub?: string;
  body: string;
  items?: ConfirmItem[];
  button: string;
  /** danger: can't be undone (red) · starred: some items are protected · normal */
  tone: 'danger' | 'starred' | 'normal';
  /** Footer note; defaults by tone. */
  foot?: string;
  /** Only show the Cancel button (the action is refused). */
  refusal?: boolean;
  /** A text field under the list (e.g. the name for new albums); read it with `askText()`. */
  field?: { label: string; value: string };
}

export const confirmState = $state({ request: null as ConfirmRequest | null, value: '' });

let resolver: ((ok: boolean) => void) | null = null;
/** The field's text when the last confirmation was answered. */
let answered = '';

export function ask(request: ConfirmRequest): Promise<boolean> {
  resolver?.(false);
  confirmState.value = request.field?.value ?? '';
  confirmState.request = request;
  return new Promise((resolve) => (resolver = resolve));
}

/** `ask()` with a text field: resolves with the trimmed text when confirmed, null when cancelled. */
export async function askText(request: ConfirmRequest & { field: { label: string; value: string } }): Promise<string | null> {
  return (await ask(request)) ? answered : null;
}

export function answer(ok: boolean): void {
  answered = confirmState.value.trim();
  confirmState.request = null;
  resolver?.(ok);
  resolver = null;
}
