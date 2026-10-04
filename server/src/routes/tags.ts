import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import { addField, changeKind, deleteField, kindCosts, listFields, moveField, typeChangeLoss, updateField } from '../services/fields.ts';
import { requireLibrary } from '../services/library.ts';
import {
  addAlias, addImplication, createTag, createType, deleteTags, deleteType, implicationImpact, listTags, listTypes, makeMainName,
  mergeTags, moveType, removeAlias, removeImplication, resolveNames, savePage, suggestTags, tagDetail, updateTag, updateType, wikiPage,
} from '../services/tags.ts';

const id = z.object({ id: z.coerce.number().int().positive() });
const ids = z.array(z.number().int().positive()).min(1).max(10000);
const fieldKind = z.enum(['text', 'longtext', 'number', 'date', 'link', 'choice', 'image', 'tagref']);
const fieldOptions = z.object({
  choices: z.array(z.string().max(100)).max(200),
  unit: z.string().max(20),
  types: z.array(z.number().int().positive()).max(50),
  multi: z.boolean(),
}).partial();

export const tagTypeRoutes = new Hono()
  .get('/', (c) => {
    const lib = requireLibrary();
    return c.json({ types: listTypes(lib), fields: listFields(lib) });
  })
  .post('/:id/fields', valid('param', id), valid('json', z.object({ label: z.string().max(100), kind: fieldKind, options: fieldOptions.optional() })), (c) =>
    c.json(addField(requireLibrary(), c.req.valid('param').id, c.req.valid('json'))))
  .post('/', valid('json', z.object({ name: z.string().max(100), color: z.string() })), (c) => c.json(createType(requireLibrary(), c.req.valid('json'))))
  .patch('/:id', valid('param', id), valid('json', z.object({ name: z.string().max(100), color: z.string(), isDefault: z.literal(true) }).partial()), (c) =>
    c.json(updateType(requireLibrary(), c.req.valid('param').id, c.req.valid('json'))))
  .post('/:id/move', valid('param', id), valid('json', z.object({ delta: z.union([z.literal(-1), z.literal(1)]) })), (c) =>
    c.json({ types: moveType(requireLibrary(), c.req.valid('param').id, c.req.valid('json').delta) }))
  .delete('/:id', valid('param', id), (c) => {
    deleteType(requireLibrary(), c.req.valid('param').id);
    return c.json({ ok: true });
  });

export const fieldRoutes = new Hono()
  .patch('/:id', valid('param', id), valid('json', z.object({ label: z.string().max(100), options: fieldOptions }).partial()), (c) =>
    c.json(updateField(requireLibrary(), c.req.valid('param').id, c.req.valid('json'))))
  .post('/:id/move', valid('param', id), valid('json', z.object({ delta: z.union([z.literal(-1), z.literal(1)]) })), (c) =>
    c.json({ fields: moveField(requireLibrary(), c.req.valid('param').id, c.req.valid('json').delta) }))
  /** For each kind, how many values switching to it would lose. */
  .get('/:id/kind-costs', valid('param', id), (c) => c.json({ costs: kindCosts(requireLibrary(), c.req.valid('param').id) }))
  .post('/:id/kind', valid('param', id), valid('json', z.object({ kind: fieldKind, clearLost: z.boolean().default(false) })), (c) => {
    const { kind, clearLost } = c.req.valid('json');
    return c.json(changeKind(requireLibrary(), c.req.valid('param').id, kind, clearLost));
  })
  .delete('/:id', valid('param', id), (c) => {
    deleteField(requireLibrary(), c.req.valid('param').id);
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
  /** Wiki links: `names` comma-separated (tag names can't contain commas). */
  .get('/resolve', valid('query', z.object({ names: z.string().max(20000) })), (c) =>
    c.json({ tags: resolveNames(requireLibrary(), c.req.valid('query').names.split(',').filter(Boolean)) }))
  .get('/:id/page', valid('param', id), (c) => c.json(wikiPage(requireLibrary(), c.req.valid('param').id)))
  .put('/:id/page', valid('param', id), valid('json', z.object({
    description: z.string().max(25000).nullable().optional(),
    coverFileId: z.number().int().positive().nullable().optional(),
    fields: z.record(z.object({ value: z.string().max(10000).nullable().optional(), fileId: z.number().int().positive().nullable().optional(), tagIds: z.array(z.number().int().positive()).max(200).optional() })).optional(),
  })), (c) => c.json(savePage(requireLibrary(), c.req.valid('param').id, c.req.valid('json'))))
  /** Field values a tag would lose by changing type. */
  .get('/:id/type-change', valid('param', id), valid('query', z.object({ typeId: z.coerce.number().int().positive() })), (c) => {
    const lib = requireLibrary();
    const t = tagDetail(lib, c.req.valid('param').id);
    return c.json({ lost: typeChangeLoss(lib, t.id, t.typeId, c.req.valid('query').typeId) });
  })
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
