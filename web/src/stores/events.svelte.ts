/**
 * Live updates from /api/events. Pages read the counters in an $effect and reload when they change
 * (technical doc §13.3). Bursts (an import sends one event per file) are coalesced.
 */
export const live = $state({
  scanning: false,
  /** Bumped whenever files change (scan finished, favorites, moves, imports…). */
  files: 0,
  /** Bumped whenever folders change. */
  folders: 0,
  /** Bumped when the open library changes. */
  library: 0,
  /** Bumped when Library Health issues change (the badge, the Health page). */
  health: 0,
});

const COALESCE_MS = 250;
type Counter = 'files' | 'folders' | 'library' | 'health';
const pending = new Set<Counter>();
let timer: ReturnType<typeof setTimeout> | null = null;

function bump(key: Counter) {
  pending.add(key);
  timer ??= setTimeout(() => {
    timer = null;
    for (const k of pending) live[k]++;
    pending.clear();
  }, COALESCE_MS);
}

let source: EventSource | null = null;

export function connectEvents(): void {
  if (source) return;
  source = new EventSource('/api/events');
  source.addEventListener('scan', (e) => {
    live.scanning = (JSON.parse((e as MessageEvent<string>).data) as { status: string }).status === 'scanning';
  });
  source.addEventListener('files-changed', () => bump('files'));
  source.addEventListener('folders-changed', () => bump('folders'));
  source.addEventListener('library-changed', () => bump('library'));
  source.addEventListener('health-changed', () => bump('health'));
  // EventSource reconnects by itself; after a reconnect, assume something changed.
  source.addEventListener('open', () => {
    bump('files');
    bump('folders');
    bump('health');
  });
}
