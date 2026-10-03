import { hc } from 'hono/client';
import type { AppType } from '@media-view/server/app';
import type { ApiErrorBody } from '@media-view/shared';

export const client = hc<AppType>(location.origin);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface JsonResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

/** Await a typed client call; throw ApiError with the server's code and message on failure. */
export async function unwrap<R extends JsonResponse>(request: Promise<R>): Promise<Awaited<ReturnType<R['json']>>> {
  let res: R;
  try {
    res = await request;
  } catch {
    throw new ApiError(0, 'OFFLINE', 'The media-view server is not responding.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    // No JSON error body: the response came from the dev proxy, not from our server.
    if (!body?.error) throw new ApiError(res.status, 'OFFLINE', 'The media-view server is not responding.');
    throw new ApiError(res.status, body?.error.code ?? `HTTP_${res.status}`, body?.error.message ?? res.statusText);
  }
  return res.json() as Awaited<ReturnType<R['json']>>;
}
