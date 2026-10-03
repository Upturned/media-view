import type { DB } from '../db/connection.ts';
import { underPrefix } from '../lib/paths.ts';

/**
 * Rewrite the stored paths of everything under `oldPrefix` (folders and files) to start with
 * `newPrefix` — the DB side of moving or renaming a folder (technical doc §6.2).
 */
export function rewritePrefix(db: DB, oldPrefix: string, newPrefix: string): void {
  const under = underPrefix('rel_path', oldPrefix);
  const from = oldPrefix.length + 1;
  db.prepare(`UPDATE folders SET rel_path = ? || substr(rel_path, ?) WHERE module = 'images' AND ${under.sql}`)
    .run(newPrefix, from, ...under.params);
  db.prepare(`UPDATE files SET rel_path = ? || substr(rel_path, ?) WHERE media_type = 'image' AND ${under.sql}`)
    .run(newPrefix, from, ...under.params);
}
