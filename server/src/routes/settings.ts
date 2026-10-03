import { valid } from '../lib/validate.ts';
import { Hono } from 'hono';
import { z } from 'zod';
import { loadConfig, updateConfig } from '../config.ts';

/** Per-machine UI preferences stored in the app config (technical doc §5.1). */
export const settingsRoutes = new Hono()
  .get('/ui', (c) => c.json(loadConfig().ui))
  .patch('/ui', valid('json', z.object({ theme: z.string().min(1).max(50) }).partial()), (c) => {
    const change = c.req.valid('json');
    const config = updateConfig((cfg) => Object.assign(cfg.ui, change));
    return c.json(config.ui);
  });
