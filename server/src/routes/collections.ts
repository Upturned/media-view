import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import {
  addItems, collectionDetail, createCollection, deleteCollection, listCollections, membership, moveItems, removeItems,
  restoreCollection, setOrder, updateCollection,
} from '../services/collections.ts';
import { requireLibrary } from '../services/library.ts';

/** Collections (technical doc §12.6, milestone 6). Their images come from `/api/files?collection=`. */

const id = z.object({ id: z.coerce.number().int().positive() });
const ids = z.array(z.number().int().positive()).min(1).max(10000);
const name = z.string().max(300);
const description = z.string().max(2000).nullable();

export const collectionRoutes = new Hono()
  /** Cards: `q` filters by name; `tag` keeps the ones holding images with that tag (the wiki). */
  .get(
    '/',
    valid('query', z.object({
      q: z.string().max(300).optional(),
      tag: z.coerce.number().int().positive().optional(),
      sort: z.enum(['name', 'count', 'changed', 'tagged']).optional(),
      order: z.enum(['asc', 'desc']).default('asc'),
      limit: z.coerce.number().int().min(1).max(1000).optional(),
    })),
    (c) => c.json({ collections: listCollections(requireLibrary(), c.req.valid('query')) }),
  )
  .post('/', valid('json', z.object({ name, description: description.optional() })), (c) => c.json(createCollection(requireLibrary(), c.req.valid('json'))))
  /** For the Add to collection dialog: how many of these images each collection already holds. */
  .post('/membership', valid('json', z.object({ ids })), (c) => c.json({ counts: membership(requireLibrary(), c.req.valid('json').ids) }))
  /** Undo a delete, from what DELETE returned. */
  .post(
    '/restore',
    valid('json', z.object({
      id: z.number().int().positive(),
      name,
      description: description,
      coverFileId: z.number().int().positive().nullable(),
      createdAt: z.number().int(),
      fileIds: z.array(z.number().int().positive()).max(100000),
    })),
    (c) => c.json(restoreCollection(requireLibrary(), c.req.valid('json'))),
  )
  .get('/:id', valid('param', id), (c) => c.json(collectionDetail(requireLibrary(), c.req.valid('param').id)))
  .patch(
    '/:id',
    valid('param', id),
    valid('json', z.object({ name, description, coverFileId: z.number().int().positive().nullable() }).partial()),
    (c) => c.json(updateCollection(requireLibrary(), c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/:id', valid('param', id), (c) => c.json(deleteCollection(requireLibrary(), c.req.valid('param').id)))
  /** Append images (ones already there are reported, not moved). */
  .post('/:id/items', valid('param', id), valid('json', z.object({ ids })), (c) =>
    c.json(addItems(requireLibrary(), c.req.valid('param').id, c.req.valid('json').ids)))
  .delete('/:id/items', valid('param', id), valid('json', z.object({ ids })), (c) =>
    c.json(removeItems(requireLibrary(), c.req.valid('param').id, c.req.valid('json').ids)))
  /** Reorder: move images to just before `before` (null = the end). */
  .post('/:id/move', valid('param', id), valid('json', z.object({ ids, before: z.number().int().positive().nullable() })), (c) =>
    c.json(moveItems(requireLibrary(), c.req.valid('param').id, c.req.valid('json').ids, c.req.valid('json').before)))
  /** The exact order (Undo): missing images are added back, unnamed ones go last. */
  .put('/:id/order', valid('param', id), valid('json', z.object({ ids: z.array(z.number().int().positive()).max(100000) })), (c) => {
    setOrder(requireLibrary(), c.req.valid('param').id, c.req.valid('json').ids);
    return c.json({ ok: true });
  });
