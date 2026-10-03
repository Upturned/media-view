import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import { briefFiles, fileDetail, folderFileNames, listFileIds, listFiles, locateFile, PAGE_SIZE, randomFile, setFavorite, tagCounts } from '../services/files.ts';
import { bulkRename, copyFiles, moveFiles, renameFile, setFileDescription, undoMove } from '../services/file-ops.ts';
import { importPath, importStream, logImport } from '../services/import.ts';
import { requireLibrary } from '../services/library.ts';
import { recycleFiles } from '../services/recycle.ts';
import { changeFileTags, tagCoverage } from '../services/tags.ts';

const flag = z.enum(['1', '0', 'true', 'false']).transform((v) => v === '1' || v === 'true').optional();

/** The list filters, shared by the grid, the viewer's navigation and Random. */
const fileQuery = z.object({
  folder: z.coerce.number().int().positive().optional(),
  recursive: flag,
  favorites: flag,
  name: z.string().max(200).optional(),
  q: z.string().max(2000).optional(),
  tag: z.coerce.number().int().positive().optional(),
  sort: z.enum(['name', 'modified', 'added', 'size', 'random']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  seed: z.coerce.number().int().optional(),
});

const id = z.object({ id: z.coerce.number().int().positive() });
const ids = z.array(z.number().int().positive()).min(1).max(10000);
/** An album or the Inbox; null = the Inbox. */
const targetId = z.number().int().positive().nullable();
const policy = z.enum(['keep-both', 'replace', 'skip']).default('keep-both');

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
  .post('/brief', valid('json', z.object({ ids })), (c) => c.json({ files: briefFiles(requireLibrary(), c.req.valid('json').ids) }))
  /** Tag counts over the matching images (the tag sidebar). */
  .get('/tag-counts', valid('query', fileQuery), (c) => c.json({ tags: tagCounts(requireLibrary(), c.req.valid('query')) }))
  /** Add and remove tags on images (ids from the tag input; implied tags follow). */
  .post('/tags', valid('json', z.object({ ids, add: z.array(z.number().int().positive()).max(1000).default([]), remove: z.array(z.number().int().positive()).max(1000).default([]) })), (c) => {
    const { ids: list, add, remove } = c.req.valid('json');
    return c.json(changeFileTags(requireLibrary(), list, add, remove));
  })
  /** For the bulk tag dialog: the tags on the images, and on how many. */
  .post('/tag-coverage', valid('json', z.object({ ids })), (c) => c.json({ tags: tagCoverage(requireLibrary(), c.req.valid('json').ids) }))
  .get('/names', valid('query', z.object({ folder: z.coerce.number().int().positive() })), (c) =>
    c.json({ names: folderFileNames(requireLibrary(), c.req.valid('query').folder) }))
  .get('/ids', valid('query', fileQuery), (c) => c.json({ ids: listFileIds(requireLibrary(), c.req.valid('query')) }))
  .get('/locate', valid('query', fileQuery.extend({ id: z.coerce.number().int().positive() })), (c) => {
    const { id: fileId, ...q } = c.req.valid('query');
    return c.json({ position: locateFile(requireLibrary(), q, fileId) });
  })
  .get('/random', valid('query', fileQuery.extend({ exclude: z.coerce.number().int().positive().optional() })), (c) => {
    const { exclude, ...q } = c.req.valid('query');
    return c.json({ id: randomFile(requireLibrary(), q, exclude) });
  })
  .post('/favorite', valid('json', z.object({ ids, favorited: z.boolean() })), (c) => {
    const { ids: list, favorited } = c.req.valid('json');
    return c.json({ changed: setFavorite(requireLibrary(), list, favorited) });
  })
  .post('/move', valid('json', z.object({ ids, folderId: targetId, policy })), (c) => {
    const { ids: list, folderId, policy: p } = c.req.valid('json');
    return c.json(moveFiles(requireLibrary(), list, folderId, p));
  })
  .post(
    '/undo-move',
    valid('json', z.object({ items: z.array(z.object({ id: z.number().int().positive(), folderId: z.number().int().positive(), filename: z.string().min(1) })).min(1).max(10000) })),
    (c) => c.json(undoMove(requireLibrary(), c.req.valid('json').items)),
  )
  .post('/copy', valid('json', z.object({ ids, folderId: targetId, policy, copyTags: z.boolean().default(true) })), async (c) => {
    const { ids: list, folderId, policy: p, copyTags } = c.req.valid('json');
    return c.json(await copyFiles(requireLibrary(), list, folderId, p, copyTags));
  })
  .post(
    '/rename-bulk',
    valid('json', z.object({ ids, pattern: z.string().min(1).max(200), start: z.number().int().min(0).max(999999), digits: z.number().int().min(1).max(6) })),
    (c) => {
      const { ids: list, pattern, start, digits } = c.req.valid('json');
      return c.json(bulkRename(requireLibrary(), list, pattern, start, digits));
    },
  )
  .post('/recycle', valid('json', z.object({ ids })), (c) => c.json(recycleFiles(requireLibrary(), c.req.valid('json').ids)))
  /** One file from the picker (the client loops, so it can show progress and cancel). */
  .post('/import', valid('json', z.object({ folderId: targetId.optional(), path: z.string().min(1).max(2000) })), async (c) => {
    const { folderId, path } = c.req.valid('json');
    return c.json(await importPath(requireLibrary(), folderId ?? null, path));
  })
  /** One dropped file, as the raw request body. */
  .post(
    '/upload',
    valid('query', z.object({ folderId: z.coerce.number().int().positive().optional(), name: z.string().min(1).max(500) })),
    async (c) => {
      const { folderId, name } = c.req.valid('query');
      const body = c.req.raw.body ? Readable.fromWeb(c.req.raw.body as import('node:stream/web').ReadableStream) : Readable.from([]);
      return c.json(await importStream(requireLibrary(), folderId ?? null, name, body));
    },
  )
  .post(
    '/import-done',
    valid('json', z.object({ target: z.string().max(500), copied: z.number(), renamed: z.number(), skipped: z.number(), rejected: z.number(), cancelled: z.boolean() })),
    (c) => {
      logImport(c.req.valid('json'));
      return c.json({ ok: true });
    },
  )
  .get('/:id', valid('param', id), (c) => c.json(fileDetail(requireLibrary(), c.req.valid('param').id)))
  .patch(
    '/:id',
    valid('param', id),
    valid('json', z.object({ favorited: z.boolean(), name: z.string().max(300), description: z.string().max(5000) }).partial()),
    (c) => {
      const lib = requireLibrary();
      const fileId = c.req.valid('param').id;
      const change = c.req.valid('json');
      if (change.favorited !== undefined) setFavorite(lib, [fileId], change.favorited);
      if (change.description !== undefined) setFileDescription(lib, fileId, change.description);
      if (change.name !== undefined) renameFile(lib, fileId, change.name);
      return c.json(fileDetail(lib, fileId));
    },
  );
