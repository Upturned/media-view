import { valid } from '../lib/validate.ts';
import { Hono } from 'hono';
import { z } from 'zod';
import { about, openLogsFolder, pickFolder } from '../services/system.ts';

export const systemRoutes = new Hono()
  .post('/pick-folder', valid('json', z.object({ title: z.string().max(200).optional() })), async (c) => {
    const path = await pickFolder(c.req.valid('json').title ?? 'Choose a folder');
    return c.json({ path });
  })
  .post('/open-logs', (c) => c.json({ opened: openLogsFolder() }))
  .get('/about', (c) => c.json(about()));
