import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './connection.ts';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Apply numbered `NNN_name.sql` files above `PRAGMA user_version`, each in its own transaction. */
export function migrate(db: DB): number {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending = fs.readdirSync(MIGRATIONS_DIR)
    .map((file) => ({ file, version: Number(/^(\d+)_/.exec(file)?.[1]) }))
    .filter((m) => Number.isInteger(m.version) && m.version > current)
    .sort((a, b) => a.version - b.version);

  for (const m of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
  return pending.length;
}
