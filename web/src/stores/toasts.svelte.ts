import { untrack } from 'svelte';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
  /** e.g. Go to / Undo after a move (design M3 · 01). */
  actions: ToastAction[];
}

export interface ToastAction {
  label: string;
  run: () => void;
}

export const toasts = $state({ list: [] as Toast[] });

let nextId = 1;

export function toast(message: string, kind: Toast['kind'] = 'info', action?: ToastAction | ToastAction[]): void {
  const id = nextId++;
  const actions = action ? [action].flat() : [];
  untrack(() => toasts.list.push({ id, message, kind, actions }));
  setTimeout(() => dismiss(id), actions.length ? 10_000 : kind === 'error' ? 8000 : 4000);
}

export function dismiss(id: number): void {
  toasts.list = toasts.list.filter((t) => t.id !== id);
}

/** A toast for a failed call. */
export function toastError(err: unknown): void {
  toast(err instanceof Error ? err.message : String(err), 'error');
}
