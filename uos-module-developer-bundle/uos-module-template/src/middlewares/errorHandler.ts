import { Request, Response, NextFunction } from 'express';

// @uos/auth throws its own error classes (AuthError, PermissionError,
// ScopeConfigError, TenantNotFoundError) for auth/scope failures — they
// share this shape (statusCode + code + message) with AppError below, so a
// structural check catches all of them without importing and listing every
// class the package might ever add. Missing one here means that failure
// mode falls through to a generic 500 instead of the right 401/403 — easy
// to do by accident if you only check `instanceof` against your own classes.
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

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (isStatusCodedError(err)) {
    res
      .status(err.statusCode)
      .json({ success: false, code: err.code, error: err.message });
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
