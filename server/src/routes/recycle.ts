import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import { requireLibrary } from '../services/library.ts';
import { deletePermanently, emptyBin, listBin, restore } from '../services/recycle.ts';

const id = z.object({ id: z.coerce.number().int().positive() });

export const recycleRoutes = new Hono()
  .get('/', (c) => c.json({ items: listBin(requireLibrary()) }))
  /** Back where it came from, or into `targetFolderId` (null = top level, for folders). */
  .post('/:id/restore', valid('param', id), valid('json', z.object({ targetFolderId: z.number().int().positive().nullable().optional() })), (c) =>
    c.json(restore(requireLibrary(), c.req.valid('param').id, c.req.valid('json').targetFolderId)))
  .post('/delete', valid('json', z.object({ ids: z.array(z.number().int().positive()).min(1).max(10000) })), (c) =>
    c.json(deletePermanently(requireLibrary(), c.req.valid('json').ids)))
  .delete('/', (c) => c.json(emptyBin(requireLibrary())));
