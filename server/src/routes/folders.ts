import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import { createFolder, folderChildren, folderDetail, libraryFront } from '../services/folders.ts';
import { requireLibrary } from '../services/library.ts';

const id = z.object({ id: z.coerce.number().int().positive() });

export const folderRoutes = new Hono()
  /** No parent: the Library page (Inbox + categories). With a parent: its sub-categories and albums. */
  .get('/', valid('query', z.object({ parent: z.coerce.number().int().positive().optional() })), (c) => {
    const lib = requireLibrary();
    const { parent } = c.req.valid('query');
    if (parent === undefined) return c.json({ front: libraryFront(lib), children: null });
    return c.json({ front: null, children: folderChildren(lib, parent) });
  })
  .get('/:id', valid('param', id), (c) => c.json(folderDetail(requireLibrary(), c.req.valid('param').id)))
  .post(
    '/',
    valid('json', z.object({
      parentId: z.number().int().positive().nullable(),
      kind: z.enum(['category', 'subcategory', 'album']),
      name: z.string().max(300),
    })),
    (c) => c.json(createFolder(requireLibrary(), c.req.valid('json'))),
  );
