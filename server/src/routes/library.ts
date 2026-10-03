import { Hono } from 'hono';
import { z } from 'zod';
import { loadConfig, updateConfig } from '../config.ts';
import { valid } from '../lib/validate.ts';
import {
  createLibrary, getLibrary, isLibrary, libraryInfo, openLibrary, requireLibrary, type OpenLibrary,
} from '../services/library.ts';
import { requestScan, scanStatus } from '../workers/scanner.ts';

const pathBody = z.object({ path: z.string().min(1) });

const info = (lib: OpenLibrary) => libraryInfo(lib, scanStatus(lib));

export const libraryRoutes = new Hono()
  .get('/', (c) => {
    const lib = getLibrary();
    return c.json({ library: lib ? info(lib) : null });
  })
  .post('/open', valid('json', pathBody), (c) => {
    const lib = openLibrary(c.req.valid('json').path);
    return c.json({ library: info(lib) });
  })
  .post('/create', valid('json', pathBody), (c) => {
    const lib = createLibrary(c.req.valid('json').path);
    return c.json({ library: info(lib) });
  })
  .get('/recent', (c) => {
    const current = getLibrary()?.root.toLowerCase();
    const recent = loadConfig().recentLibraries.map((p) => ({
      path: p,
      available: isLibrary(p),
      current: p.toLowerCase() === current,
    }));
    return c.json({ recent });
  })
  .delete('/recent', valid('json', pathBody), (c) => {
    const target = c.req.valid('json').path.toLowerCase();
    updateConfig((cfg) => {
      cfg.recentLibraries = cfg.recentLibraries.filter((p) => p.toLowerCase() !== target);
    });
    return c.json({ ok: true });
  })
  .post('/rescan', (c) => {
    requestScan(requireLibrary());
    return c.json({ started: true });
  });
