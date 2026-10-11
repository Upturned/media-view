import { EventEmitter } from 'node:events';

/** Server-side events pushed to the client over /api/events (technical doc §12.7). */
export type AppEvent =
  | { type: 'scan'; status: 'scanning' | 'idle' }
  | { type: 'files-changed' }
  | { type: 'folders-changed' }
  | { type: 'library-changed' }
  /** Library Health issues changed (the top-bar badge reloads). */
  | { type: 'health-changed' };

const bus = new EventEmitter();
bus.setMaxListeners(50);

export function emit(event: AppEvent): void {
  bus.emit('event', event);
}

export function subscribe(listener: (event: AppEvent) => void): () => void {
  bus.on('event', listener);
  return () => bus.off('event', listener);
}
