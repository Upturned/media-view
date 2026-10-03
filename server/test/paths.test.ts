import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { assertInside, escapeLike, toDbPath, underPrefix } from '../src/lib/paths.ts';

describe('paths', () => {
  it('normalizes to NFC with / separators', () => {
    expect(toDbPath('Fantasy\\Elves\\\\Portraits\\')).toBe('Fantasy/Elves/Portraits');
    expect(toDbPath('Cafe\u0301')).toBe('Café');
  });

  it('rejects paths escaping the root', () => {
    expect(() => assertInside('C:/lib/Images', 'C:/lib/Images/a/b.png')).not.toThrow();
    expect(() => assertInside('C:/lib/Images', 'C:/lib/Images/../secret')).toThrow();
  });

  it('prefix matching treats _ and % literally and ignores case', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (rel_path TEXT COLLATE NOCASE)');
    const rows = ['my_album/a.png', 'myXalbum/b.png', 'MY_ALBUM/sub/c.png', 'my_album', '100%/d.png', '100x/e.png'];
    for (const r of rows) db.prepare('INSERT INTO t VALUES (?)').run(r);

    const match = (prefix: string) => {
      const { sql, params } = underPrefix('rel_path', prefix);
      return db.prepare(`SELECT rel_path FROM t WHERE ${sql} ORDER BY rel_path`).pluck().all(...params);
    };

    expect(match('my_album')).toEqual(['my_album/a.png', 'MY_ALBUM/sub/c.png']);
    expect(match('100%')).toEqual(['100%/d.png']);
  });

  it('escapes LIKE wildcards in text terms', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
