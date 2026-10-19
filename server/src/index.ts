import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { appDataDir, loadConfig } from './config.ts';
import { createApp } from './app.ts';
import { WEB_DIST } from './lib/app-dir.ts';
import { applyRetention, flush, getLogDir, log, setLogDir } from './lib/log.ts';
import { openUrl } from './lib/windows.ts';
import { closeLibrary, openLibrary } from './services/library.ts';
import { installWorkers } from './workers/index.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEV_WEB_PORT = 2080;

const config = loadConfig();
const port = Number(process.env.PORT ?? config.port);
setLogDir(path.join(appDataDir(), 'logs'));
installWorkers();

if (config.lastLibrary) {
  try {
    openLibrary(config.lastLibrary);
  } catch (err) {
    log('error', 'library', 'could not reopen last library', { path: config.lastLibrary, message: (err as Error).message });
  }
}

const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
if (process.env.NODE_ENV !== 'production') {
  origins.add(`http://localhost:${DEV_WEB_PORT}`).add(`http://127.0.0.1:${DEV_WEB_PORT}`);
}
const app = createApp(origins);

// The built frontend (npm run build). In development Vite serves it instead.
if (fs.existsSync(WEB_DIST)) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), WEB_DIST) }));
}

// The packaged app's start.bat sets MEDIA_VIEW_OPEN: open the browser once the server listens.
const openBrowser = process.env.MEDIA_VIEW_OPEN === '1';
const url = `http://localhost:${port}`;
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  console.log(`media-view running at ${url}`);
  if (openBrowser) {
    console.log('Keep this window open while you use the app; close it to stop media-view.');
    openUrl(url);
  }
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE' || !openBrowser) throw err;
  // Started twice: show the copy that's running. Another program on the port: say so.
  fetch(`${url}/api/system/about`)
    .then((r) => r.json() as Promise<{ name?: string }>)
    .catch(() => ({ name: undefined }))
    .then((info) => {
      if (info.name === 'media-view') {
        console.log(`media-view is already running at ${url}`);
        openUrl(url);
        setTimeout(() => process.exit(0), 500);
      } else {
        const where = process.env.PORT ? 'PORT in start.bat' : `"port" in ${path.join(appDataDir(), 'config.json')}`;
        console.error(`Port ${port} is used by another program. Change ${where} and start again.`);
        process.exit(1);
      }
    });
});

setInterval(() => {
  const dir = getLogDir();
  if (dir) applyRetention(dir);
}, DAY_MS).unref();

function shutdown() {
  closeLibrary();
  flush();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', flush);
