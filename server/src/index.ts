import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { appDataDir, loadConfig } from './config.ts';
import { createApp } from './app.ts';
import { applyRetention, flush, getLogDir, log, setLogDir } from './lib/log.ts';
import { closeLibrary, openLibrary } from './services/library.ts';
import { installWorkers } from './workers/index.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEV_WEB_PORT = 5173;

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
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), webDist) }));
}

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  console.log(`media-view running at http://localhost:${port}`);
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
