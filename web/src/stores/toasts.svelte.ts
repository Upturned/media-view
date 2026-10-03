import { untrack } from 'svelte';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

export const toasts = $state({ list: [] as Toast[] });

let nextId = 1;

export function toast(message: string, kind: Toast['kind'] = 'info'): void {
  const id = nextId++;
  untrack(() => toasts.list.push({ id, message, kind }));
  setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
}

export function dismiss(id: number): void {
  toasts.list = toasts.list.filter((t) => t.id !== id);
}
