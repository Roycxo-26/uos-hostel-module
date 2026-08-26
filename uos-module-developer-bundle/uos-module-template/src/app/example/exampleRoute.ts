import { Router } from 'express';
import { requirePermission } from '@uos/auth';
import { MODULE } from '../../constants';
import { redis } from '../../redis';
import {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
} from './exampleController';

// Change 'example' permission strings to match your module's permission registry.
// Permission naming convention: '<resource>:<action>'
// Examples: 'ticket:read', 'seat:assign', 'invoice:approve'

const permConfig = { module: MODULE, redis };

export function exampleRouter(): Router {
  const r = Router();

  r.get('/', requirePermission('example:read', permConfig), getItems);

  r.get('/:id', requirePermission('example:read', permConfig), getItem);

  r.post('/', requirePermission('example:create', permConfig), createItem);

  r.patch('/:id', requirePermission('example:update', permConfig), updateItem);

  r.delete('/:id', requirePermission('example:delete', permConfig), deleteItem);

  return r;
}
