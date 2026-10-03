import { untrack } from 'svelte';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
  /** e.g. Undo after a move (design M3 · 01). */
  action?: { label: string; run: () => void };
}

export const toasts = $state({ list: [] as Toast[] });

let nextId = 1;

export function toast(message: string, kind: Toast['kind'] = 'info', action?: Toast['action']): void {
  const id = nextId++;
  untrack(() => toasts.list.push({ id, message, kind, action }));
  setTimeout(() => dismiss(id), action ? 10_000 : kind === 'error' ? 8000 : 4000);
}

export function dismiss(id: number): void {
  toasts.list = toasts.list.filter((t) => t.id !== id);
}

/** A toast for a failed call. */
export function toastError(err: unknown): void {
  toast(err instanceof Error ? err.message : String(err), 'error');
}
