import type { NextFunction, Request, Response } from 'express';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Deep snake_case -> camelCase. Idempotent on keys that are already
 * camelCase, so it's safe over responses that mix raw Knex rows (this
 * module's DB columns) with hand-typed camelCase objects (e.g. this
 * module's own service-layer types). Not part of the template — repository
 * functions here return raw rows on purpose (schema in the migration stays
 * the legible source of truth for field names); this is the one seam where
 * that becomes the camelCase the frontend actually consumes. */
function toCamelCase(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(toCamelCase);
  if (isPlainObject(input)) {
    return Object.fromEntries(Object.entries(input).map(([k, v]) => [snakeToCamel(k), toCamelCase(v)]));
  }
  return input;
}

export function camelCaseResponses(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => originalJson(toCamelCase(body))) as typeof res.json;
  next();
}
