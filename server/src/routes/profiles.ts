import { Hono } from 'hono';
import { z } from 'zod';
import { valid } from '../lib/validate.ts';
import { requireLibrary } from '../services/library.ts';
import {
  activeProfile, createProfile, deleteImpact, deleteProfile, importPrefs, linkTag, listProfiles, lockProfile, profileInfo,
  profileTags, requireMe, setPassword, switchProfile, unlinkTag, updatePrefs, updateProfile,
} from '../services/profiles.ts';

/**
 * Local profiles (docs/profiles.md §7.2). Every change is made as the profile in use, so writes go to
 * `/me`; `:id` only reads another profile, switches to it or deletes it.
 */

const id = z.object({ id: z.coerce.number().int().positive() });
const password = z.string().max(200);
const role = z.enum(['creator', 'subject']);
const link = z.object({ tagId: z.number().int().positive(), role });

const prefs = z.object({
  'grid.cols': z.number().int().min(2).max(10),
  'grid.sort': z.enum(['name', 'modified', 'added', 'size', 'format', 'random', 'position']),
  'grid.order': z.enum(['asc', 'desc']),
  'grid.group': z.enum(['none', 'collection', 'format']),
  'grid.index': z.boolean(),
  'viewer.interval': z.number().int().min(1).max(600),
  'viewer.loop': z.boolean(),
  'viewer.shuffle': z.boolean(),
  theme: z.string().min(1).max(50),
}).partial().strip();

export const profileRoutes = new Hono()
  /** The picker: every profile, and which one is in use (null = none yet). */
  .get('/', (c) => {
    const lib = requireLibrary();
    return c.json({ profiles: listProfiles(lib), active: lib.profileId });
  })
  .post('/', valid('json', z.object({ name: z.string().max(200), password: password.nullable().optional() })), async (c) =>
    c.json(await createProfile(requireLibrary(), c.req.valid('json'))))
  .post('/switch', valid('json', z.object({ id: z.number().int().positive(), password: password.optional() })), async (c) => {
    const { id: target, password: pw } = c.req.valid('json');
    return c.json(await switchProfile(requireLibrary(), target, pw));
  })
  .post('/lock', (c) => {
    lockProfile(requireLibrary());
    return c.json({ ok: true });
  })
  .get('/me', (c) => c.json(activeProfile(requireLibrary())))
  .patch(
    '/me',
    valid('json', z.object({ name: z.string().max(200), pictureFileId: z.number().int().positive().nullable(), color: z.string().max(20) }).partial()),
    (c) => {
      const lib = requireLibrary();
      return c.json(updateProfile(lib, requireMe(lib), c.req.valid('json')));
    },
  )
  .post('/me/password', valid('json', z.object({ current: password.optional(), next: password.nullable() })), async (c) => {
    const lib = requireLibrary();
    const { current, next } = c.req.valid('json');
    return c.json(await setPassword(lib, requireMe(lib), current, next));
  })
  .patch('/me/prefs', valid('json', prefs), (c) => {
    const lib = requireLibrary();
    return c.json(updatePrefs(lib, requireMe(lib), c.req.valid('json')));
  })
  /** One-time hand-over of the browser's saved preferences after the upgrade (docs/profiles.md §6.1). */
  .post('/me/import-prefs', valid('json', prefs), (c) => {
    const lib = requireLibrary();
    return c.json(importPrefs(lib, requireMe(lib), c.req.valid('json')));
  })
  .put('/me/tags', valid('json', link), (c) => {
    const lib = requireLibrary();
    const { tagId, role: r } = c.req.valid('json');
    return c.json({ tags: linkTag(lib, requireMe(lib), tagId, r) });
  })
  .delete('/me/tags', valid('json', link), (c) => {
    const lib = requireLibrary();
    const { tagId, role: r } = c.req.valid('json');
    return c.json({ tags: unlinkTag(lib, requireMe(lib), tagId, r) });
  })
  .get('/:id', valid('param', id), (c) => c.json(profileInfo(requireLibrary(), c.req.valid('param').id)))
  .get('/:id/tags', valid('param', id), (c) => c.json({ tags: profileTags(requireLibrary(), c.req.valid('param').id) }))
  /** What deleting would remove, for the confirmation. */
  .get('/:id/impact', valid('param', id), (c) => c.json(deleteImpact(requireLibrary(), c.req.valid('param').id)))
  .delete('/:id', valid('param', id), valid('json', z.object({ password: password.optional() })), async (c) => {
    const lib = requireLibrary();
    await deleteProfile(lib, requireMe(lib), c.req.valid('param').id, c.req.valid('json').password);
    return c.json({ ok: true });
  });
