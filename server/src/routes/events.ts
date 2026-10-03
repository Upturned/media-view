import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { subscribe, type AppEvent } from '../lib/events.ts';

const KEEPALIVE_MS = 25_000;

/** Server-sent events: scan status and change notifications (technical doc §12.7). */
export const eventRoutes = new Hono().get('/', (c) =>
  streamSSE(c, async (stream) => {
    const queue: AppEvent[] = [];
    let wake: (() => void) | null = null;
    const unsubscribe = subscribe((e) => {
      queue.push(e);
      wake?.();
    });
    stream.onAbort(unsubscribe);
    try {
      while (!stream.aborted) {
        while (queue.length > 0) {
          const e = queue.shift()!;
          await stream.writeSSE({ event: e.type, data: JSON.stringify(e) });
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, KEEPALIVE_MS);
        });
        wake = null;
        if (queue.length === 0) await stream.writeSSE({ event: 'ping', data: '' });
      }
    } finally {
      unsubscribe();
    }
  }),
);
