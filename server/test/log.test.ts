import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyRetention, MAX_FILES } from '../src/lib/log.ts';
import { tempDir } from './helpers.ts';

function day(i: number): string {
  return new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
}

describe('log retention', () => {
  it('keeps at most 100 files, deleting the oldest', () => {
    const dir = tempDir();
    for (let i = 0; i < MAX_FILES + 5; i++) fs.writeFileSync(path.join(dir, `${day(i)}.log`), 'x\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a log');

    applyRetention(dir);

    const logs = fs.readdirSync(dir).filter((f) => f.endsWith('.log')).sort();
    expect(logs).toHaveLength(MAX_FILES);
    expect(logs[0]).toBe(`${day(5)}.log`);
    expect(fs.existsSync(path.join(dir, 'notes.txt'))).toBe(true);
  });

  it('deletes the oldest files while over 50 MB, overflow files ordered after their day', () => {
    const dir = tempDir();
    const tenMb = Buffer.alloc(10 * 1024 * 1024);
    for (const name of [`${day(0)}.log`, `${day(0)}.1.log`, `${day(1)}.log`, `${day(2)}.log`, `${day(3)}.log`, `${day(4)}.log`]) {
      fs.writeFileSync(path.join(dir, name), tenMb);
    }

    applyRetention(dir);

    expect(fs.readdirSync(dir).sort()).toEqual([`${day(0)}.1.log`, `${day(1)}.log`, `${day(2)}.log`, `${day(3)}.log`, `${day(4)}.log`]);
  });
});
