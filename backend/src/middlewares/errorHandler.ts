import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

// @uos/auth throws its own error classes (AuthError, PermissionError,
// ScopeConfigError, TenantNotFoundError) for auth/scope failures — they
// share this shape (statusCode + code + message) with AppError below, so a
// structural check catches all of them without importing and listing every
// class the package might ever add. Missing one here means that failure
// mode falls through to a generic 500 instead of the right 401/403 — easy
// to do by accident if you only check `instanceof` against your own classes.
// (Real bug found doing the SMRU migration — see FOR_YOUR_CLAUDE_CODE.md §4
// step 10 / §7 finding 8: body-parser and Postgres both already attach a
// correct status code to their own errors too, so this also catches those.)
interface StatusCodedError extends Error {
  statusCode: number;
  code: string;
}

function isStatusCodedError(err: unknown): err is StatusCodedError {
  return (
    err instanceof Error &&
    typeof (err as StatusCodedError).statusCode === 'number' &&
    typeof (err as StatusCodedError).code === 'string'
  );
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (isStatusCodedError(err)) {
    res.status(err.statusCode).json({ success: false, code: err.code, error: err.message });
    return;
  }

  // Real bug, found live: every controller in this module calls
  // `xSchema.parse(req.body)` directly (12 files) with no ZodError handling
  // anywhere — a raw ZodError has no `statusCode`/`code: string`, so
  // isStatusCodedError above always returned false for it and EVERY
  // validation failure app-wide (bad UUID, missing required field, wrong
  // enum value, string too long — anything Zod itself catches, not just
  // this one field) fell all the way through to the generic 500 "Internal
  // server error" below. Not a headcount-specific issue — every endpoint in
  // every module here shares this one error handler. Caught while testing
  // Headcount's "paste a room ID" field with a room *code* instead of its
  // UUID; the fix belongs here, not in that one call site.
  if (err instanceof ZodError) {
    const message = err.issues.map((issue) => `${issue.path.join('.') || '(request body)'}: ${issue.message}`).join('; ');
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', error: message });
    return;
  }

  console.error(`[${process.env.MODULE_NAME}] unhandled error:`, err);
  res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    error: 'Internal server error',
  });
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not permitted') {
    super(403, 'FORBIDDEN', message);
  }
}
