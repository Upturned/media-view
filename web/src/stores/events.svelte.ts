/**
 * Live updates from /api/events. Pages read the counters in an $effect and reload when they change
 * (technical doc §13.3).
 */
export const live = $state({
  scanning: false,
  /** Bumped whenever files change (scan finished, favorites, …). */
  files: 0,
  /** Bumped whenever folders change. */
  folders: 0,
  /** Bumped when the open library changes. */
  library: 0,
});

let source: EventSource | null = null;

export function connectEvents(): void {
  if (source) return;
  source = new EventSource('/api/events');
  source.addEventListener('scan', (e) => {
    live.scanning = (JSON.parse((e as MessageEvent<string>).data) as { status: string }).status === 'scanning';
  });
  source.addEventListener('files-changed', () => live.files++);
  source.addEventListener('folders-changed', () => live.folders++);
  source.addEventListener('library-changed', () => live.library++);
  // EventSource reconnects by itself; after a reconnect, assume something changed.
  source.addEventListener('open', () => {
    live.files++;
    live.folders++;
  });
}
