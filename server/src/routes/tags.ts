import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import { requireLibrary } from '../services/library.ts';
import {
  addAlias, addImplication, createTag, createType, deleteTags, deleteType, implicationImpact, listTags, listTypes, makeMainName,
  mergeTags, moveType, removeAlias, removeImplication, suggestTags, tagDetail, updateTag, updateType,
} from '../services/tags.ts';

const id = z.object({ id: z.coerce.number().int().positive() });
const ids = z.array(z.number().int().positive()).min(1).max(10000);

export const tagTypeRoutes = new Hono()
  .get('/', (c) => c.json({ types: listTypes(requireLibrary()) }))
  .post('/', valid('json', z.object({ name: z.string().max(100), color: z.string() })), (c) => c.json(createType(requireLibrary(), c.req.valid('json'))))
  .patch('/:id', valid('param', id), valid('json', z.object({ name: z.string().max(100), color: z.string(), isDefault: z.literal(true) }).partial()), (c) =>
    c.json(updateType(requireLibrary(), c.req.valid('param').id, c.req.valid('json'))))
  .post('/:id/move', valid('param', id), valid('json', z.object({ delta: z.union([z.literal(-1), z.literal(1)]) })), (c) =>
    c.json({ types: moveType(requireLibrary(), c.req.valid('param').id, c.req.valid('json').delta) }))
  .delete('/:id', valid('param', id), (c) => {
    deleteType(requireLibrary(), c.req.valid('param').id);
    return c.json({ ok: true });
  });

export const tagRoutes = new Hono()
  /** The directory (and the Search page's Tags tab): optionally filtered by name / alias and type. */
  .get('/', valid('query', z.object({
    q: z.string().max(200).optional(),
    type: z.coerce.number().int().positive().optional(),
    sort: z.enum(['name', 'count']).default('name'),
    limit: z.coerce.number().int().min(1).max(100000).optional(),
  })), (c) => {
    const { q, type, sort, limit } = c.req.valid('query');
    return c.json({ tags: listTags(requireLibrary(), { q, typeId: type, sort, limit }) });
  })
  .get('/suggest', valid('query', z.object({ q: z.string().max(200), limit: z.coerce.number().int().min(1).max(50).default(8) })), (c) => {
    const { q, limit } = c.req.valid('query');
    return c.json({ tags: suggestTags(requireLibrary(), q, limit) });
  })
  .post('/', valid('json', z.object({ name: z.string().max(200), typeId: z.number().int().positive().optional() })), (c) =>
    c.json(createTag(requireLibrary(), c.req.valid('json'))))
  .post('/merge', valid('json', z.object({ sourceIds: ids, targetId: z.number().int().positive(), keepAliases: z.boolean().default(true) })), (c) => {
    const { sourceIds, targetId, keepAliases } = c.req.valid('json');
    return c.json(mergeTags(requireLibrary(), sourceIds, targetId, keepAliases));
  })
  .post('/delete', valid('json', z.object({ ids })), (c) => c.json(deleteTags(requireLibrary(), c.req.valid('json').ids)))
  .get('/:id', valid('param', id), (c) => c.json(tagDetail(requireLibrary(), c.req.valid('param').id)))
  .patch('/:id', valid('param', id), valid('json', z.object({
    name: z.string().max(200),
    typeId: z.number().int().positive(),
    coverFileId: z.number().int().positive().nullable(),
  }).partial()), (c) => c.json(updateTag(requireLibrary(), c.req.valid('param').id, c.req.valid('json'))))
  .post('/:id/aliases', valid('param', id), valid('json', z.object({ alias: z.string().max(200) })), (c) =>
    c.json(addAlias(requireLibrary(), c.req.valid('param').id, c.req.valid('json').alias)))
  .post('/:id/aliases/remove', valid('param', id), valid('json', z.object({ alias: z.string().max(200) })), (c) =>
    c.json(removeAlias(requireLibrary(), c.req.valid('param').id, c.req.valid('json').alias)))
  .post('/:id/aliases/main', valid('param', id), valid('json', z.object({ alias: z.string().max(200) })), (c) =>
    c.json(makeMainName(requireLibrary(), c.req.valid('param').id, c.req.valid('json').alias)))
  /** How many images adding / removing an implication would touch (the app asks above 30). */
  .get('/:id/implications/impact', valid('param', id), valid('query', z.object({ implied: z.coerce.number().int().positive(), action: z.enum(['add', 'remove']) })), (c) => {
    const { implied, action } = c.req.valid('query');
    return c.json(implicationImpact(requireLibrary(), c.req.valid('param').id, implied, action));
  })
  .post('/:id/implications', valid('param', id), valid('json', z.object({ impliedId: z.number().int().positive() })), (c) =>
    c.json(addImplication(requireLibrary(), c.req.valid('param').id, c.req.valid('json').impliedId)))
  .post('/:id/implications/remove', valid('param', id), valid('json', z.object({ impliedId: z.number().int().positive() })), (c) =>
    c.json(removeImplication(requireLibrary(), c.req.valid('param').id, c.req.valid('json').impliedId)));
