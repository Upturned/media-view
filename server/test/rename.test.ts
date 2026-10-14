import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/lib/errors.ts';
import { renameWithRetry } from '../src/lib/rename.ts';
import { tempDir } from './helpers.ts';

const locked = (code = 'EPERM') => Object.assign(new Error(`${code}: operation not permitted, rename`), { code });

afterEach(() => vi.restoreAllMocks());

describe('renameWithRetry', () => {
  it('waits out a short-lived lock', () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'Art'));
    const real = fs.renameSync;
    let calls = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (++calls <= 2) throw locked(calls === 1 ? 'EPERM' : 'EBUSY');
      real(from, to);
    });
    renameWithRetry(path.join(dir, 'Art'), path.join(dir, 'Arte'));
    expect(calls).toBe(3);
    expect(fs.existsSync(path.join(dir, 'Arte'))).toBe(true);
  });

  it('turns a lock that stays into a message the user can act on', () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'Art'));
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw locked();
    });
    let error: unknown;
    try {
      renameWithRetry(path.join(dir, 'Art'), path.join(dir, 'Arte'));
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 409, code: 'IN_USE' });
    expect((error as Error).message).toMatch(/“Art”.*Explorer window/);
  });

  it('passes other errors through untouched', () => {
    const dir = tempDir();
    expect(() => renameWithRetry(path.join(dir, 'nope'), path.join(dir, 'still-nope'))).toThrow(/ENOENT/);
  });
});
