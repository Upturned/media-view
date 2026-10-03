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
}

export const confirmState = $state({ request: null as ConfirmRequest | null });

let resolver: ((ok: boolean) => void) | null = null;

export function ask(request: ConfirmRequest): Promise<boolean> {
  resolver?.(false);
  confirmState.request = request;
  return new Promise((resolve) => (resolver = resolve));
}

export function answer(ok: boolean): void {
  confirmState.request = null;
  resolver?.(ok);
  resolver = null;
}
