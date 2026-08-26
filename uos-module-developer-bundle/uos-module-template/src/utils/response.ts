import { Response } from 'express';

export function success<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({ success: true, data });
}

export function created<T>(res: Response, data: T): Response {
  return success(res, data, 201);
}
