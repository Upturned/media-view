import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import {
  cleanThumbnails, clearLogFiles, fixAll, fixEverything, fixIssue, healthReport, healthSummary, reopenIssue, setUntaggedFlags, untaggedImages,
  untrackedAction,
} from '../services/health.ts';
import { requireLibrary } from '../services/library.ts';

/** Library Health (technical doc §12.7, milestone 7). */

const id = z.object({ id: z.coerce.number().int().positive() });
const kind = z.enum([
  'missing_folder', 'missing_file', 'external_move', 'ambiguous_move', 'loose_files', 'nested_in_album', 'unmarked_folder',
  'wrong_type', 'unsupported', 'moved_file', 'duplicate', 'orphan_thumbs',
]);
const folderKind = z.enum(['category', 'subcategory', 'album']);

const fix = z.discriminatedUnion('action', [
  z.object({ action: z.literal('recreate') }),
  z.object({ action: z.literal('forget') }),
  z.object({ action: z.literal('locate'), path: z.string().min(1).max(2000) }),
  z.object({ action: z.literal('keep') }),
  z.object({ action: z.literal('undo') }),
  z.object({ action: z.literal('pick'), candidateId: z.number().int().positive() }),
  z.object({ action: z.literal('keep-new') }),
  z.object({ action: z.literal('new-album'), name: z.string().min(1).max(255) }),
  z.object({ action: z.literal('into-album'), albumId: z.number().int().positive().nullable() }),
  z.object({ action: z.literal('move-out') }),
  z.object({ action: z.literal('convert'), name: z.string().min(1).max(255) }),
  z.object({ action: z.literal('confirm'), folderKind: folderKind.optional() }),
  z.object({ action: z.literal('recycle') }),
  z.object({ action: z.literal('ignore') }),
  z.object({ action: z.literal('record') }),
  z.object({ action: z.literal('ok') }),
  z.object({ action: z.literal('keep-one'), keepId: z.number().int().positive() }),
  z.object({ action: z.literal('merge'), keepId: z.number().int().positive() }),
]);

const ids = z.union([z.literal('all'), z.array(z.number().int().positive()).min(1).max(100000)]);

export const healthRoutes = new Hono()
  /** Everything the page shows: issues with their details, untagged images by album, thumbnails, logs. */
  .get('/', (c) => c.json(healthReport(requireLibrary())))
  /** Counts for the top-bar badge. */
  .get('/summary', (c) => c.json(healthSummary(requireLibrary())))
  /** Untagged images (outside the Inbox), album by album; `fresh` keeps the NEW ones. */
  .get(
    '/untagged',
    valid('query', z.object({
      fresh: z.enum(['1', '0']).optional(),
      /** The ones set aside with Leave untagged instead. */
      left: z.enum(['1', '0']).optional(),
      folder: z.coerce.number().int().positive().optional(),
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    })),
    (c) => {
      const q = c.req.valid('query');
      return c.json(untaggedImages(requireLibrary(), { ...q, fresh: q.fresh === '1', left: q.left === '1' }));
    },
  )
  /** Mark as seen (clears NEW) or Leave untagged (off the list): some images, or all of them. */
  .post('/untagged/seen', valid('json', z.object({ ids })), (c) => c.json(setUntaggedFlags(requireLibrary(), c.req.valid('json').ids, 'seen')))
  .post('/untagged/leave', valid('json', z.object({ ids })), (c) => c.json(setUntaggedFlags(requireLibrary(), c.req.valid('json').ids, 'leave')))
  .post('/untagged/put-back', valid('json', z.object({ ids })), (c) => c.json(setUntaggedFlags(requireLibrary(), c.req.valid('json').ids, 'put-back')))
  /** Not tracked: Track again (back to being reported) or Record (to the hidden Invalid folder). */
  .post('/untracked/:action', valid('param', z.object({ action: z.enum(['track', 'record']) })), valid('json', z.object({ paths: z.array(z.string().min(1).max(4000)).min(1).max(10000) })), (c) =>
    c.json(untrackedAction(requireLibrary(), c.req.valid('json').paths, c.req.valid('param').action)))
  .post('/thumbnails/clean', (c) => c.json(cleanThumbnails(requireLibrary())))
  .delete('/logs', (c) => c.json(clearLogFiles()))
  /** One fix on one issue. */
  .post('/:id/fix', valid('param', id), valid('json', fix), async (c) =>
    c.json(await fixIssue(requireLibrary(), c.req.valid('param').id, c.req.valid('json'))))
  /** The same fix on every issue of a kind (only fixes that need no choice); skipped ones are counted. */
  .post('/fix-all', valid('json', z.object({ kind, action: z.enum(['recreate', 'forget', 'keep', 'undo', 'new-album', 'move-out', 'confirm', 'recycle', 'ignore', 'record', 'keep-one', 'ok']) })), async (c) => {
    const { kind: k, action } = c.req.valid('json');
    return c.json(await fixAll(requireLibrary(), k, action));
  })
  /** Apply to all across the page: red and amber, each kind's default fix; ones that need a choice are counted. */
  .post('/fix-everything', async (c) => c.json(await fixEverything(requireLibrary())))
  /** Undo a dismissing fix (Keep, Keep as new, Confirm): the issue comes back. */
  .post('/reopen', valid('json', z.object({ kind, subject: z.string().min(1).max(4000), payload: z.string().max(1_000_000) })), (c) => {
    reopenIssue(requireLibrary(), c.req.valid('json'));
    return c.json({ ok: true });
  });
