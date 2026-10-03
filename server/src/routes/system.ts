import { valid } from '../lib/validate.ts';
import { Hono } from 'hono';
import { z } from 'zod';
import { notFound } from '../lib/errors.ts';
import { absPath, requireLibrary } from '../services/library.ts';
import { about, openLogsFolder, openWith, pickFiles, pickFolder } from '../services/system.ts';

export const systemRoutes = new Hono()
  .post('/pick-folder', valid('json', z.object({ title: z.string().max(200).optional() })), async (c) => {
    const path = await pickFolder(c.req.valid('json').title ?? 'Choose a folder');
    return c.json({ path });
  })
  .post('/pick-files', valid('json', z.object({ title: z.string().max(200).optional() })), async (c) => {
    return c.json({ paths: await pickFiles(c.req.valid('json').title ?? 'Add images') });
  })
  .post('/open-with', valid('json', z.object({ fileId: z.number().int().positive() })), (c) => {
    const lib = requireLibrary();
    const rel = lib.db.prepare('SELECT rel_path FROM files WHERE id = ? AND recycled = 0').pluck().get(c.req.valid('json').fileId) as string | undefined;
    if (!rel) throw notFound('FILE_NOT_FOUND', 'This image no longer exists.');
    openWith(absPath(lib, rel));
    return c.json({ ok: true });
  })
  .post('/open-logs', (c) => c.json({ opened: openLogsFolder() }))
  .get('/about', (c) => c.json(about()));
