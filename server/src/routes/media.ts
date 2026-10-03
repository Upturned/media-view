import fs from 'node:fs';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { z } from 'zod';
import { notFound } from '../lib/errors.ts';
import { valid } from '../lib/validate.ts';
import { absPath, requireLibrary } from '../services/library.ts';
import { getThumbnail, isRaster } from '../services/thumbnails.ts';

/** Originals and thumbnails, addressed by file id (technical doc §8.5). */

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
};

interface MediaRow {
  id: number;
  rel_path: string;
  ext: string;
  size: number;
  mtime: number;
  hash: string | null;
}

/** The file of an id; recycled ones only when asked (the Recycle Bin shows their thumbnails). */
function fileRow(id: number, allowRecycled = false): MediaRow {
  const row = requireLibrary().db.prepare(
    `SELECT id, rel_path, ext, size, mtime, hash FROM files WHERE id = ? ${allowRecycled ? '' : 'AND recycled = 0'}`,
  ).get(id) as MediaRow | undefined;
  if (!row) throw notFound('FILE_NOT_FOUND', 'This image no longer exists.');
  return row;
}

/** `?v=` pins the URL to one version of the file, so it can be cached for good. */
function cacheControl(versioned: boolean): string {
  return versioned ? 'private, max-age=31536000, immutable' : 'private, no-cache';
}

/** Stream a file, honoring a single `Range` (needed for video later). */
function sendFile(file: string, type: string, etag: string, headers: Record<string, string>, range?: string, ifNoneMatch?: string): Response {
  if (ifNoneMatch === etag) return new Response(null, { status: 304, headers: { ETag: etag, ...headers } });
  const size = fs.statSync(file).size;
  const base = { 'Content-Type': type, ETag: etag, 'Accept-Ranges': 'bytes', ...headers };
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
    });
  }
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { ...base, 'Content-Length': String(size) } });
}

const params = z.object({ id: z.coerce.number().int().positive() });

function original(row: MediaRow, c: { req: { query(k: string): string | undefined; header(k: string): string | undefined } }): Response {
  const lib = requireLibrary();
  const file = absPath(lib, row.rel_path);
  if (!fs.existsSync(file)) throw notFound('FILE_MISSING', 'The file is missing on disk.');
  const headers: Record<string, string> = { 'Cache-Control': cacheControl(c.req.query('v') !== undefined) };
  // SVGs can carry scripts: sandbox them when opened directly.
  if (row.ext === 'svg') headers['Content-Security-Policy'] = 'sandbox';
  const etag = `"${row.hash ?? `${row.size}-${row.mtime}`}"`;
  return sendFile(file, MIME[row.ext] ?? 'application/octet-stream', etag, headers, c.req.header('range'), c.req.header('if-none-match'));
}

export const mediaRoutes = new Hono()
  .get('/file/:id', valid('param', params), (c) => original(fileRow(c.req.valid('param').id), c))
  .get('/thumb/:id', valid('param', params), async (c) => {
    const row = fileRow(c.req.valid('param').id, true);
    if (!isRaster(row.ext)) return original(row, c); // SVG: served as-is, no thumbnail
    const lib = requireLibrary();
    let thumb: string;
    try {
      thumb = await getThumbnail(lib, row);
    } catch {
      throw notFound('NO_THUMBNAIL', 'This image could not be read.');
    }
    const etag = `"t-${row.hash ?? `${row.size}-${row.mtime}`}"`;
    return sendFile(thumb, 'image/webp', etag, { 'Cache-Control': cacheControl(c.req.query('v') !== undefined) }, undefined, c.req.header('if-none-match'));
  });
