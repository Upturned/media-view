import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import {
  createFolder, folderChildren, folderDetail, folderTree, libraryFront, moveFolder, renameFolder,
  setFolderCover, setFolderDescription,
} from '../services/folders.ts';
import { requireLibrary } from '../services/library.ts';
import { recycleFolder } from '../services/recycle.ts';

const id = z.object({ id: z.coerce.number().int().positive() });

export const folderRoutes = new Hono()
  /** No parent: the Library page (Inbox + categories). With a parent: its sub-categories and albums. */
  .get('/', valid('query', z.object({ parent: z.coerce.number().int().positive().optional() })), (c) => {
    const lib = requireLibrary();
    const { parent } = c.req.valid('query');
    if (parent === undefined) return c.json({ front: libraryFront(lib), children: null });
    return c.json({ front: null, children: folderChildren(lib, parent) });
  })
  /** Every folder, flat, for the folder picker. */
  .get('/tree', (c) => c.json({ folders: folderTree(requireLibrary()) }))
  .get('/:id', valid('param', id), (c) => c.json(folderDetail(requireLibrary(), c.req.valid('param').id)))
  .post(
    '/',
    valid('json', z.object({
      parentId: z.number().int().positive().nullable(),
      kind: z.enum(['category', 'subcategory', 'album']),
      name: z.string().max(300),
    })),
    (c) => c.json(createFolder(requireLibrary(), c.req.valid('json'))),
  )
  .patch(
    '/:id',
    valid('param', id),
    valid('json', z.object({
      name: z.string().max(300),
      description: z.string().max(5000),
      coverFileId: z.number().int().positive().nullable(),
    }).partial()),
    (c) => {
      const lib = requireLibrary();
      const folderId = c.req.valid('param').id;
      const change = c.req.valid('json');
      if (change.description !== undefined) setFolderDescription(lib, folderId, change.description);
      if (change.coverFileId !== undefined) setFolderCover(lib, folderId, change.coverFileId);
      if (change.name !== undefined) renameFolder(lib, folderId, change.name);
      return c.json(folderDetail(lib, folderId));
    },
  )
  .post('/:id/move', valid('param', id), valid('json', z.object({ parentId: z.number().int().positive().nullable() })), (c) =>
    c.json(moveFolder(requireLibrary(), c.req.valid('param').id, c.req.valid('json').parentId)))
  .post('/:id/recycle', valid('param', id), (c) => {
    recycleFolder(requireLibrary(), c.req.valid('param').id);
    return c.json({ ok: true });
  });
