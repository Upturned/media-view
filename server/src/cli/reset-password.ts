import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { openDatabase } from '../db/connection.ts';
import { flush, log, setLogDir } from '../lib/log.ts';
import { DATA_DIR } from '../lib/paths.ts';
import { normName } from '../services/profiles.ts';

/**
 * Clear a forgotten profile password (docs/profiles.md §4.6):
 *   npm run profile:reset-password -- "<library path>" "<profile name>"
 * or reset-password.bat in the portable app, which asks for both. A password only gates the app, so
 * anyone who can run this could already read the library: it gives nothing away.
 */

const ask = createInterface({ input: process.stdin, output: process.stdout });

function fail(message: string): never {
  console.error(message);
  ask.close();
  process.exit(1);
}

let [root, name] = process.argv.slice(2);
root ||= (await ask.question('Library folder: ')).trim().replace(/^"(.*)"$/, '$1');
const dataDir = path.join(path.resolve(root), DATA_DIR);
const dbFile = path.join(dataDir, 'library.db');
if (!fs.existsSync(path.join(dataDir, 'library.json')) || !fs.existsSync(dbFile)) fail(`${root} isn't a media-view library.`);

const db = openDatabase(dbFile);
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'profiles'").get()) {
  fail('This library has no profiles yet: open it once with this version of media-view.');
}
const protectedOnes = db.prepare('SELECT name FROM profiles WHERE pass_hash IS NOT NULL ORDER BY name COLLATE NOCASE').pluck().all() as string[];
if (protectedOnes.length === 0) fail('No profile in this library has a password.');
if (!name) {
  console.log(`Profiles with a password: ${protectedOnes.join(', ')}`);
  name = (await ask.question('Profile name: ')).trim();
}
const target = db.prepare('SELECT id, uuid, name, pass_hash FROM profiles WHERE name_norm = ?').get(normName(name)) as
  { id: number; uuid: string; name: string; pass_hash: string | null } | undefined;
if (!target) fail(`There's no profile called “${name}”.`);
if (target.pass_hash === null) fail(`“${target.name}” has no password.`);

db.prepare('UPDATE profiles SET pass_hash = NULL, updated_at = ? WHERE id = ?').run(Date.now(), target.id);
db.close();
setLogDir(path.join(dataDir, 'logs'));
log('info', 'profiles', 'password reset from the command line', { uuid: target.uuid, name: target.name });
flush();
console.log(`“${target.name}” has no password now. If media-view is running, its next profile switch sees the change.`);
ask.close();
