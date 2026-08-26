import { Router } from 'express';
import * as controller from './controller';

export function meRouter(): Router {
  const r = Router();
  r.get('/', controller.getMe);
  return r;
}
