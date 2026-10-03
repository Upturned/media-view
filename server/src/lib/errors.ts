import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** An expected failure, returned to the client as `{ error: { code, message } }`. */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
