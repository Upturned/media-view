import { Hono } from 'hono';
import type { ApiErrorBody } from '@media-view/shared';
import { AppError } from './lib/errors.ts';
import { log } from './lib/log.ts';
import { libraryRoutes } from './routes/library.ts';
import { settingsRoutes } from './routes/settings.ts';
import { systemRoutes } from './routes/system.ts';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

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

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json<ApiErrorBody>({ error: { code: err.code, message: err.message } }, err.status);
    }
    log('error', 'api', `${c.req.method} ${c.req.path} failed`, { message: err.message, stack: err.stack });
    return c.json<ApiErrorBody>({ error: { code: 'INTERNAL', message: 'Something went wrong. Details are in the logs.' } }, 500);
  });

  const api = app
    .route('/api/library', libraryRoutes)
    .route('/api/settings', settingsRoutes)
    .route('/api/system', systemRoutes);

  app.notFound((c) => c.json<ApiErrorBody>({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));

  return api;
}

export type AppType = ReturnType<typeof createApp>;
