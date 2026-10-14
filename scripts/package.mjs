// npm run package: a portable zip of the app for Windows 10/11 64-bit (technical doc §14.1).
//
//   release/media-view-<version>-win-x64.zip
//     node.exe            the Node.js this script runs on (same version: the native modules match it)
//     start.bat           starts the server and opens the browser
//     reset-password.bat  clears a forgotten profile password (docs/profiles.md §4.6)
//     app/server.mjs      the server, bundled into one file
//     app/reset-password.mjs  the reset-password command, bundled the same way
//     app/web/dist/       the built web app
//     app/migrations/     database migrations
//     app/node_modules/   only the native modules (better-sqlite3, sharp) and what they need
//
// node.exe is downloaded once (checked against nodejs.org's checksums) into release/.cache; the zip
// itself never needs the internet. Libraries and %APPDATA%\media-view stay outside it.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE = ['better-sqlite3', 'sharp'];
/** Needed to install a native module, not to run it. */
const INSTALL_ONLY = new Set(['prebuild-install']);

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.error('npm run package builds the Windows x64 zip, with this machine’s native modules: run it on Windows x64.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const name = `media-view-${pkg.version}-win-x64`;
const releaseDir = path.join(ROOT, 'release');
const out = path.join(releaseDir, name);
const app = path.join(out, 'app');
const step = (s) => console.log(`\n▸ ${s}`);

fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(`${out}.zip`, { force: true });
fs.mkdirSync(app, { recursive: true });

step('Building the web app');
execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: path.join(ROOT, 'web'), stdio: 'inherit' });
fs.cpSync(path.join(ROOT, 'web', 'dist'), path.join(app, 'web', 'dist'), { recursive: true });

step('Bundling the server');
const bundle = (entry, outfile) => build({
  entryPoints: [path.join(ROOT, 'server', 'src', entry)],
  outfile: path.join(app, outfile),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: `node${process.versions.node.split('.')[0]}`,
  external: NATIVE,
  define: { __BUNDLED__: 'true', 'process.env.NODE_ENV': '"production"' },
  // Some dependencies are CommonJS and call require().
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  legalComments: 'linked',
  logLevel: 'warning',
});
await bundle('index.ts', 'server.mjs');
await bundle(path.join('cli', 'reset-password.ts'), 'reset-password.mjs');
fs.cpSync(path.join(ROOT, 'server', 'src', 'db', 'migrations'), path.join(app, 'migrations'), { recursive: true });
fs.writeFileSync(path.join(app, 'package.json'), `${JSON.stringify({ name: 'media-view', version: pkg.version, releaseDate: pkg.releaseDate, private: true, type: 'module' }, null, 2)}\n`);

step('Copying the native modules');
const modules = new Set();
const walk = (dep) => {
  if (modules.has(dep) || INSTALL_ONLY.has(dep)) return;
  const dir = path.join(ROOT, 'node_modules', dep);
  if (!fs.existsSync(dir)) return; // an optional dependency for another platform
  modules.add(dep);
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  for (const d of [...Object.keys(p.dependencies ?? {}), ...Object.keys(p.optionalDependencies ?? {})]) walk(d);
};
NATIVE.forEach(walk);
for (const dep of modules) {
  const from = path.join(ROOT, 'node_modules', dep);
  fs.cpSync(from, path.join(app, 'node_modules', dep), {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(from, src).split(path.sep);
      // better-sqlite3 ships SQLite's sources and build files: only its compiled module is needed.
      if (dep === 'better-sqlite3' && ['deps', 'src', 'binding.gyp'].includes(rel[0])) return false;
      if (dep === 'better-sqlite3' && rel[0] === 'build' && rel.length > 1 && rel[1] !== 'Release') return false;
      if (dep === 'better-sqlite3' && rel[0] === 'build' && rel.length > 2 && !rel[2].endsWith('.node')) return false;
      return !/\.(md|markdown|d\.ts|map)$/i.test(src) || /license/i.test(src);
    },
  });
}
console.log(`  ${[...modules].join(', ')}`);

step(`Node.js ${process.version} for Windows x64`);
const nodeExe = await portableNode(process.version);
fs.copyFileSync(nodeExe, path.join(out, 'node.exe'));
fs.copyFileSync(`${nodeExe}.LICENSE`, path.join(out, 'node-LICENSE.txt'));

fs.writeFileSync(path.join(out, 'start.bat'), [
  '@echo off',
  'title media-view',
  'rem Starts media-view and opens it in the browser. Close this window to stop it.',
  'cd /d "%~dp0"',
  'set MEDIA_VIEW_OPEN=1',
  '"%~dp0node.exe" "%~dp0app\\server.mjs"',
  'if errorlevel 1 pause',
  '',
].join('\r\n'));
fs.writeFileSync(path.join(out, 'reset-password.bat'), [
  '@echo off',
  'title media-view: reset a password',
  'rem Clears a forgotten profile password. Asks for the library folder and the profile.',
  'cd /d "%~dp0"',
  '"%~dp0node.exe" "%~dp0app\\reset-password.mjs" %*',
  'pause',
  '',
].join('\r\n'));
fs.writeFileSync(path.join(out, 'README.txt'), [
  `media-view ${pkg.version}`,
  '',
  'Double-click start.bat: the app opens in your browser. Keep its window open while you use it;',
  'closing the window stops media-view. Starting it again while it runs just opens the browser.',
  '',
  'Forgot a profile password? Double-click reset-password.bat.',
  '',
  'Nothing is installed. Your libraries stay where you made them, and the settings are in',
  '%APPDATA%\\media-view (delete that folder to start fresh).',
  '',
].join('\r\n'));

step('Zipping');
// Windows' own tar (bsdtar) writes zip files; Git's GNU tar on the PATH doesn't.
const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
execFileSync(tar, ['-a', '-c', '-f', `${name}.zip`, name], { cwd: releaseDir, stdio: 'inherit' });
const size = fs.statSync(`${out}.zip`).size;
console.log(`\n✓ release\\${name}.zip (${(size / 1024 / 1024).toFixed(1)} MB)`);

/** node.exe of this version, from the cache or downloaded once (checked against SHASUMS256.txt). */
async function portableNode(version) {
  const cache = path.join(releaseDir, '.cache');
  const exe = path.join(cache, `node-${version}-win-x64.exe`);
  if (fs.existsSync(exe) && fs.existsSync(`${exe}.LICENSE`)) {
    console.log('  from the cache');
    return exe;
  }
  fs.mkdirSync(cache, { recursive: true });
  const base = `https://nodejs.org/dist/${version}`;
  const zipName = `node-${version}-win-x64.zip`;
  console.log(`  downloading ${base}/${zipName}`);
  const get = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
    return Buffer.from(await r.arrayBuffer());
  };
  const [sums, zip] = await Promise.all([get(`${base}/SHASUMS256.txt`), get(`${base}/${zipName}`)]);
  const expected = sums.toString('utf8').split('\n').find((l) => l.trim().endsWith(`  ${zipName}`))?.split(/\s+/)[0];
  const actual = createHash('sha256').update(zip).digest('hex');
  if (!expected || expected !== actual) throw new Error(`${zipName}: checksum mismatch — not used.`);

  const tmp = fs.mkdtempSync(path.join(cache, 'node-'));
  try {
    fs.writeFileSync(path.join(tmp, zipName), zip);
    const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    const inner = `node-${version}-win-x64`;
    execFileSync(tar, ['-x', '-f', zipName, `${inner}/node.exe`, `${inner}/LICENSE`], { cwd: tmp });
    fs.renameSync(path.join(tmp, inner, 'LICENSE'), `${exe}.LICENSE`);
    fs.renameSync(path.join(tmp, inner, 'node.exe'), exe);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return exe;
}
