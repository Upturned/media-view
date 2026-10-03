import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import { fileDetail, listFileIds, listFiles, locateFile, PAGE_SIZE, randomFile, setFavorite } from '../services/files.ts';
import { requireLibrary } from '../services/library.ts';

const flag = z.enum(['1', '0', 'true', 'false']).transform((v) => v === '1' || v === 'true').optional();

/** The list filters, shared by the grid, the viewer's navigation and Random. */
const fileQuery = z.object({
  folder: z.coerce.number().int().positive().optional(),
  recursive: flag,
  favorites: flag,
  name: z.string().max(200).optional(),
  sort: z.enum(['name', 'modified', 'added', 'size', 'random']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  seed: z.coerce.number().int().optional(),
});

const id = z.object({ id: z.coerce.number().int().positive() });

export const fileRoutes = new Hono()
  .get(
    '/',
    valid('query', fileQuery.extend({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(500).default(PAGE_SIZE),
    })),
    (c) => {
      const { offset, limit, ...q } = c.req.valid('query');
      return c.json(listFiles(requireLibrary(), q, offset, limit));
    },
  )
  .get('/ids', valid('query', fileQuery), (c) => c.json({ ids: listFileIds(requireLibrary(), c.req.valid('query')) }))
  .get('/locate', valid('query', fileQuery.extend({ id: z.coerce.number().int().positive() })), (c) => {
    const { id: fileId, ...q } = c.req.valid('query');
    return c.json({ position: locateFile(requireLibrary(), q, fileId) });
  })
  .get('/random', valid('query', fileQuery.extend({ exclude: z.coerce.number().int().positive().optional() })), (c) => {
    const { exclude, ...q } = c.req.valid('query');
    return c.json({ id: randomFile(requireLibrary(), q, exclude) });
  })
  .post('/favorite', valid('json', z.object({ ids: z.array(z.number().int().positive()).min(1).max(10000), favorited: z.boolean() })), (c) => {
    const { ids, favorited } = c.req.valid('json');
    return c.json({ changed: setFavorite(requireLibrary(), ids, favorited) });
  })
  .get('/:id', valid('param', id), (c) => c.json(fileDetail(requireLibrary(), c.req.valid('param').id)))
  .patch('/:id', valid('param', id), valid('json', z.object({ favorited: z.boolean() })), (c) => {
    const lib = requireLibrary();
    setFavorite(lib, [c.req.valid('param').id], c.req.valid('json').favorited);
    return c.json(fileDetail(lib, c.req.valid('param').id));
  });
