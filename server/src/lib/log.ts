import fs from 'node:fs';
import path from 'node:path';

/**
 * The only log writer. JSON Lines, one file per day (`YYYY-MM-DD.log`, overflow in
 * `YYYY-MM-DD.1.log`, …). Lines are buffered and flushed shortly after, and on exit.
 */

export type LogLevel = 'error' | 'warn' | 'info';

export const MAX_FILES = 100;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FLUSH_DELAY_MS = 250;

let dir: string | null = null;
let buffer: string[] = [];
let timer: NodeJS.Timeout | null = null;

export function setLogDir(next: string): void {
  if (next === dir) return;
  flush();
  dir = next;
  fs.mkdirSync(dir, { recursive: true });
  applyRetention(dir);
}

export function getLogDir(): string | null {
  return dir;
}

export function log(level: LogLevel, area: string, msg: string, data?: unknown): void {
  const line = JSON.stringify(data === undefined ? { ts: Date.now(), level, area, msg } : { ts: Date.now(), level, area, msg, data });
  buffer.push(line);
  if (level === 'error') console.error(`[${area}] ${msg}`, data ?? '');
  timer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

export function flush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!dir || buffer.length === 0) return;
  const lines = buffer.join('\n') + '\n';
  buffer = [];
  try {
    fs.appendFileSync(currentFile(dir, Buffer.byteLength(lines)), lines);
  } catch (err) {
    console.error('log write failed', err);
  }
}

function currentFile(logDir: string, incoming: number): string {
  const day = new Date().toISOString().slice(0, 10);
  for (let n = 0; ; n++) {
    const file = path.join(logDir, n === 0 ? `${day}.log` : `${day}.${n}.log`);
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (size === 0 || size + incoming <= MAX_FILE_BYTES) return file;
  }
}

/** Delete the oldest log files while there are more than MAX_FILES or more than MAX_TOTAL_BYTES. */
export function applyRetention(logDir: string): void {
  let files: { file: string; size: number }[];
  try {
    files = fs.readdirSync(logDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}(\.\d+)?\.log$/.test(f))
      .sort(compareLogNames)
      .map((f) => ({ file: path.join(logDir, f), size: fs.statSync(path.join(logDir, f)).size }));
  } catch {
    return;
  }
  let total = files.reduce((sum, f) => sum + f.size, 0);
  while (files.length > 0 && (files.length > MAX_FILES || total > MAX_TOTAL_BYTES)) {
    const oldest = files.shift()!;
    total -= oldest.size;
    fs.rmSync(oldest.file, { force: true });
  }
}

/** Oldest first: by day, then by overflow index. */
function compareLogNames(a: string, b: string): number {
  const [dayA, nA] = splitName(a);
  const [dayB, nB] = splitName(b);
  return dayA === dayB ? nA - nB : dayA < dayB ? -1 : 1;
}

function splitName(name: string): [string, number] {
  const m = /^(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.log$/.exec(name)!;
  return [m[1]!, Number(m[2] ?? 0)];
}

export function logStats(): { files: number; bytes: number } {
  if (!dir) return { files: 0, bytes: 0 };
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log'));
  return { files: files.length, bytes: files.reduce((s, f) => s + fs.statSync(path.join(dir!, f)).size, 0) };
}
