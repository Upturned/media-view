import { Hono } from 'hono';
import type { ApiErrorBody } from '@media-view/shared';
import { AppError } from './lib/errors.ts';
import { log, logContext } from './lib/log.ts';
import { getLibrary } from './services/library.ts';
import { logActor } from './services/profiles.ts';
import { collectionRoutes } from './routes/collections.ts';
import { eventRoutes } from './routes/events.ts';
import { healthRoutes } from './routes/health.ts';
import { fileRoutes } from './routes/files.ts';
import { folderRoutes } from './routes/folders.ts';
import { libraryRoutes } from './routes/library.ts';
import { mediaRoutes } from './routes/media.ts';
import { profileRoutes } from './routes/profiles.ts';
import { recycleRoutes } from './routes/recycle.ts';
import { fieldRoutes, tagRoutes, tagTypeRoutes } from './routes/tags.ts';
import { settingsRoutes } from './routes/settings.ts';
import { systemRoutes } from './routes/system.ts';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

/** What the profile picker needs: reachable before a profile is chosen (docs/profiles.md §7.1). */
const OPEN_WITHOUT_PROFILE = /^\/api\/(?:(?:library|system|events|settings)(?:\/|$)|profiles(?:\/switch|\/lock)?$)/;

/**
 * Only accept requests addressed to a loopback host (DNS-rebinding protection) and, when the
 * browser sends an Origin, only from our own pages (`allowedOrigins`).
 */
export function createApp(allowedOrigins: Set<string>) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '');
    if (!LOOPBACK_HOSTS.has(host)) return c.text('Forbidden host', 403);
    const origin = c.req.header('origin');
    if (origin && !allowedOrigins.has(origin)) return c.text('Forbidden origin', 403);
    await next();
  });

  // No profile chosen yet (a password, or several profiles): only the picker's routes answer. Requests
  // made as a profile log who made them, while the library has more than one.
  app.use('/api/*', async (c, next) => {
    const lib = getLibrary();
    if (lib && lib.profileId === null && !OPEN_WITHOUT_PROFILE.test(c.req.path)) {
      throw new AppError(401, 'PROFILE_REQUIRED', 'Choose a profile first.');
    }
    const profile = lib ? logActor(lib) : undefined;
    if (profile) await logContext.run({ profile }, next);
    else await next();
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json<ApiErrorBody>({ error: { code: err.code, message: err.message } }, err.status);
    }
    log('error', 'api', `${c.req.method} ${c.req.path} failed`, { message: err.message, stack: err.stack });
    return c.json<ApiErrorBody>({ error: { code: 'INTERNAL', message: 'Something went wrong. Details are in the logs.' } }, 500);
  });

  const api = app
    .route('/api/library', libraryRoutes)
    .route('/api/folders', folderRoutes)
    .route('/api/files', fileRoutes)
    .route('/api/recycle', recycleRoutes)
    .route('/api/tags', tagRoutes)
    .route('/api/tag-types', tagTypeRoutes)
    .route('/api/tag-fields', fieldRoutes)
    .route('/api/collections', collectionRoutes)
    .route('/api/profiles', profileRoutes)
    .route('/api/health', healthRoutes)
    .route('/api/settings', settingsRoutes)
    .route('/api/system', systemRoutes)
    .route('/api/events', eventRoutes)
    .route('/media', mediaRoutes);

  app.notFound((c) => c.json<ApiErrorBody>({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));

  return api;
}

export type AppType = ReturnType<typeof createApp>;
