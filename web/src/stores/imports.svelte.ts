import { client, unwrap } from '../api.ts';
import { toastError } from './toasts.svelte.ts';

/**
 * Imports (design M3 · 06): files are sent one at a time, so progress is exact and Cancel stops
 * between files. Runs in the background; jobs started meanwhile wait their turn.
 */

export interface ImportResult {
  name: string;
  status: 'copied' | 'renamed' | 'skipped' | 'rejected';
  savedAs?: string;
  reason?: string;
  size?: number;
}

interface ImportItem {
  name: string;
  /** A dropped file, or a path from the file picker. */
  source: File | string;
  size: number;
  result?: ImportResult;
}

export interface ImportJob {
  id: number;
  targetId: number | null;
  targetLabel: string;
  items: ImportItem[];
  done: number;
  current: string;
  status: 'waiting' | 'running' | 'finished' | 'cancelled';
}

export const imports = $state({
  jobs: [] as ImportJob[],
  minimized: false,
});

let nextId = 1;
let running = false;

export function startImport(target: { id: number | null; label: string }, sources: (File | string)[]): void {
  if (sources.length === 0) return;
  imports.jobs.push({
    id: nextId++,
    targetId: target.id,
    targetLabel: target.label,
    items: sources.map((s) => (typeof s === 'string'
      ? { name: s.split(/[\\/]/).pop() ?? s, source: s, size: 0 }
      : { name: s.name, source: s, size: s.size })),
    done: 0,
    current: '',
    status: 'waiting',
  });
  imports.minimized = false;
  void pump();
}

/** The job the panel shows: the one running, else the latest. */
export function visibleJob(): ImportJob | undefined {
  return imports.jobs.find((j) => j.status === 'running') ?? imports.jobs.at(-1);
}

export function cancelImport(): void {
  const job = imports.jobs.find((j) => j.status === 'running');
  if (job) job.status = 'cancelled';
  for (const j of imports.jobs) if (j.status === 'waiting') j.status = 'cancelled';
}

export function closeImport(): void {
  imports.jobs = imports.jobs.filter((j) => j.status === 'running' || j.status === 'waiting');
}

/** Run the files that couldn't be read again (they may have finished downloading). */
export function retryUnreadable(job: ImportJob): void {
  const again = job.items.filter((i) => i.result?.status === 'rejected' && i.result.reason?.startsWith('Couldn’t read')).map((i) => i.source);
  startImport({ id: job.targetId, label: job.targetLabel }, again);
}

export function report(job: ImportJob): string {
  return job.items
    .filter((i) => i.result)
    .map((i) => [i.result!.status, i.name, i.result!.savedAs ?? '', i.result!.reason ?? ''].join('\t').trimEnd())
    .join('\n');
}

async function sendOne(job: ImportJob, item: ImportItem): Promise<ImportResult> {
  if (typeof item.source === 'string') {
    return unwrap(client.api.files.import.$post({ json: { folderId: job.targetId ?? undefined, path: item.source } }));
  }
  const params = new URLSearchParams({ name: item.name });
  if (job.targetId !== null) params.set('folderId', String(job.targetId));
  const res = await fetch(`/api/files/upload?${params}`, { method: 'POST', body: item.source, headers: { 'Content-Type': 'application/octet-stream' } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
    throw new Error(body?.error?.message ?? res.statusText);
  }
  return (await res.json()) as ImportResult;
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let job = imports.jobs.find((j) => j.status === 'waiting'); job; job = imports.jobs.find((j) => j.status === 'waiting')) {
      job.status = 'running';
      for (const item of job.items) {
        if (job.status !== 'running') break;
        job.current = item.name;
        try {
          item.result = await sendOne(job, item);
          if (item.result.size) item.size = item.result.size;
        } catch (err) {
          item.result = { name: item.name, status: 'rejected', reason: (err as Error).message };
        }
        job.done++;
      }
      const cancelled = job.status !== 'running';
      if (!cancelled) job.status = 'finished';
      job.current = '';
      const count = (s: ImportResult['status']) => job!.items.filter((i) => i.result?.status === s).length;
      unwrap(client.api.files['import-done'].$post({
        json: { target: job.targetLabel, copied: count('copied'), renamed: count('renamed'), skipped: count('skipped'), rejected: count('rejected'), cancelled },
      })).catch(toastError);
    }
  } finally {
    running = false;
  }
}

// ─── Reading drops (files and whole folders from Explorer) ─────────────────

export interface DroppedFolder {
  name: string;
  files: File[];
}

/**
 * What was dropped: loose files, and folders with every file inside them (flattened).
 * Must be called synchronously in the drop handler (the entries vanish after it returns).
 */
export function readDrop(dt: DataTransfer): Promise<{ files: File[]; folders: DroppedFolder[] }> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return Promise.resolve({ files: [...dt.files], folders: [] });
  return (async () => {
    const files: File[] = [];
    const folders: DroppedFolder[] = [];
    for (const e of entries) {
      if (e.isFile) files.push(await fileOf(e as FileSystemFileEntry));
      else if (e.isDirectory) folders.push({ name: e.name, files: await walkDir(e as FileSystemDirectoryEntry) });
    }
    return { files, folders };
  })();
}

const fileOf = (e: FileSystemFileEntry) => new Promise<File>((resolve, reject) => e.file(resolve, reject));

async function walkDir(dir: FileSystemDirectoryEntry): Promise<File[]> {
  const reader = dir.createReader();
  const out: File[] = [];
  // readEntries returns batches until an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const e of batch) {
      if (e.name.startsWith('.')) continue;
      if (e.isFile) out.push(await fileOf(e as FileSystemFileEntry));
      else if (e.isDirectory) out.push(...(await walkDir(e as FileSystemDirectoryEntry)));
    }
  }
  return out;
}

// ─── Drag state ──────────────────────────────────────────────────────────────

/** Whether files from outside, or images from the grid, are being dragged over the window. */
export const drag = $state({ files: false, internal: false });

/** Images being dragged from the grid (the drop bar reads them). */
export let dragPayload: { id: number; filename: string }[] = [];

export function setDragPayload(files: { id: number; filename: string }[]): void {
  dragPayload = files;
  drag.internal = files.length > 0;
}

let depth = 0;
export function installDragTracking(): () => void {
  const isFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  const enter = (e: DragEvent) => {
    if (!isFiles(e)) return;
    depth++;
    drag.files = true;
  };
  const leave = (e: DragEvent) => {
    if (!isFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) drag.files = false;
  };
  const end = () => {
    depth = 0;
    drag.files = false;
  };
  // Dropping files anywhere that isn't a drop zone must not make the browser open them.
  const over = (e: DragEvent) => {
    if (isFiles(e)) e.preventDefault();
  };
  window.addEventListener('dragenter', enter);
  window.addEventListener('dragleave', leave);
  window.addEventListener('dragover', over);
  window.addEventListener('drop', (e) => {
    if (isFiles(e)) e.preventDefault();
    end();
  });
  window.addEventListener('dragend', end);
  return () => {
    window.removeEventListener('dragenter', enter);
    window.removeEventListener('dragleave', leave);
    window.removeEventListener('dragover', over);
  };
}

/** Import what was dropped: files and folders' contents, all into one target. */
export async function importDrop(dt: DataTransfer, target: { id: number | null; label: string }): Promise<void> {
  const { files, folders } = await readDrop(dt);
  startImport(target, [...files, ...folders.flatMap((f) => f.files)]);
}
