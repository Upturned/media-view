import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodSchema } from 'zod';
import { badRequest } from './errors.ts';

/** zValidator that reports failures in the standard `{ error: { code, message } }` shape. */
export function valid<T extends ZodSchema, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const message = result.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message).join('; ');
      throw badRequest('INVALID_INPUT', message);
    }
  });
}
